import { STEAM_API_KEY } from '../config.ts';
import { createPromiseCache } from '../utils/cache.ts';
import { HttpError } from '../utils/http.ts';

const API = 'https://api.steampowered.com';
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 5 * 60 * 1000;

export const steamApiConfigured = (): boolean => STEAM_API_KEY !== '';

export interface SteamProfile {
  name: string;
  avatar: string | null;
  url: string | null;
}

export interface OwnedGame {
  appId: number;
  name: string;
  playtimeMinutes: number;
  /** 마지막으로 플레이한 시각 (ISO 8601). 플레이한 적 없으면 null */
  lastPlayedAt: string | null;
  image: string;
}

export interface OwnedGames {
  /** true면 프로필의 "게임 세부 정보"가 비공개라 목록을 가져올 수 없다 */
  private: boolean;
  games: OwnedGame[];
}

export interface Achievement {
  id: string;
  name: string;
  /** 숨겨진 업적은 달성하기 전까지 설명이 비어 있다 */
  description: string;
  achieved: boolean;
  /** 달성 시각 (ISO 8601) */
  unlockedAt: string | null;
}

export interface Achievements {
  /** false면 업적이 없는 게임 */
  supported: boolean;
  private: boolean;
  achievements: Achievement[];
}

interface ApiResult {
  status: number;
  body: unknown;
}

/** Steam Web API 호출. 키는 URL에 실리므로 어떤 오류 메시지나 로그에도 주소를 남기지 않는다. */
async function callApi(path: string, params: Record<string, string>): Promise<ApiResult> {
  if (!STEAM_API_KEY) {
    throw new HttpError(503, 'Steam 연동 기능이 준비되지 않았습니다.', 'STEAM_API_KEY가 설정되지 않음');
  }
  const query = new URLSearchParams({ key: STEAM_API_KEY, ...params });
  try {
    const res = await fetch(`${API}${path}?${query}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    // 4xx는 "비공개 프로필", "업적 없는 게임" 같은 정상 상황일 수 있어 호출한 쪽이 판단한다
    if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
    return { status: res.status, body: await res.json().catch(() => null) };
  } catch (err) {
    throw new HttpError(
      502,
      'Steam에서 정보를 가져오지 못했습니다. 잠시 후 다시 시도하세요.',
      `${path} 실패: ${err instanceof Error ? err.message : err}`,
    );
  }
}

function toIso(seconds: unknown): string | null {
  return typeof seconds === 'number' && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

const profileCache = createPromiseCache<string, SteamProfile | null>({ ttlMs: CACHE_TTL_MS, maxEntries: 500 });

/** 표시용 프로필. 부가 정보이므로 실패해도 null을 돌려준다 */
export function fetchProfile(steamId: string): Promise<SteamProfile | null> {
  return profileCache(steamId, async () => {
    try {
      const { status, body } = await callApi('/ISteamUser/GetPlayerSummaries/v2/', { steamids: steamId });
      const player = (body as { response?: { players?: Record<string, unknown>[] } } | null)?.response?.players?.[0];
      if (status !== 200 || !player) return null;
      const https = (v: unknown) => (typeof v === 'string' && v.startsWith('https://') ? v : null);
      return {
        name: typeof player.personaname === 'string' ? player.personaname : steamId,
        avatar: https(player.avatarfull),
        url: https(player.profileurl),
      };
    } catch (err) {
      console.warn(`Steam 프로필 조회 실패 (${steamId}):`, err instanceof HttpError ? err.detail : err);
      return null;
    }
  });
}

const gamesCache = createPromiseCache<string, OwnedGames>({ ttlMs: CACHE_TTL_MS, maxEntries: 500 });

/** 보유 게임 목록 (플레이 시간이 긴 순) */
export function fetchOwnedGames(steamId: string): Promise<OwnedGames> {
  return gamesCache(steamId, async () => {
    const { status, body } = await callApi('/IPlayerService/GetOwnedGames/v1/', {
      steamid: steamId,
      include_appinfo: 'true',
      include_played_free_games: 'true',
    });
    if (status === 401 || status === 403) return { private: true, games: [] };
    const response = (body as { response?: { game_count?: number; games?: Record<string, unknown>[] } } | null)
      ?.response;
    if (status !== 200 || !response) {
      throw new HttpError(502, 'Steam에서 정보를 가져오지 못했습니다.', `GetOwnedGames 응답 이상 (HTTP ${status})`);
    }
    // 비공개 프로필은 game_count 없이 빈 객체가 온다. 게임이 0개인 공개 프로필은 game_count가 0이다.
    if (response.game_count === undefined) return { private: true, games: [] };

    const games = (response.games ?? [])
      .filter((g) => Number.isSafeInteger(g.appid))
      .map((g) => ({
        appId: g.appid as number,
        name: typeof g.name === 'string' ? g.name : `앱 ${g.appid}`,
        playtimeMinutes: typeof g.playtime_forever === 'number' ? g.playtime_forever : 0,
        lastPlayedAt: toIso(g.rtime_last_played),
        image: `https://cdn.akamai.steamstatic.com/steam/apps/${g.appid}/header.jpg`,
      }))
      .sort((a, b) => b.playtimeMinutes - a.playtimeMinutes || a.name.localeCompare(b.name));
    return { private: false, games };
  });
}

const achievementsCache = createPromiseCache<string, Achievements>({ ttlMs: CACHE_TTL_MS, maxEntries: 2000 });

/** 게임 하나의 업적 달성 현황 (달성한 것이 위, 최근 달성 순) */
export function fetchAchievements(steamId: string, appId: number): Promise<Achievements> {
  return achievementsCache(`${steamId}:${appId}`, async () => {
    const { status, body } = await callApi('/ISteamUserStats/GetPlayerAchievements/v1/', {
      steamid: steamId,
      appid: String(appId),
      l: 'koreana',
    });
    if (status === 401 || status === 403) return { supported: true, private: true, achievements: [] };
    // 업적이 없는 게임이나 알 수 없는 앱은 400과 함께 success: false가 온다
    const stats = (body as { playerstats?: { success?: boolean; achievements?: Record<string, unknown>[] } } | null)
      ?.playerstats;
    if (status === 400 || !stats || stats.success === false)
      return { supported: false, private: false, achievements: [] };
    if (status !== 200) {
      throw new HttpError(
        502,
        'Steam에서 정보를 가져오지 못했습니다.',
        `GetPlayerAchievements 응답 이상 (HTTP ${status})`,
      );
    }

    const achievements = (stats.achievements ?? []).map((a) => ({
      id: String(a.apiname),
      name: typeof a.name === 'string' && a.name ? a.name : String(a.apiname),
      description: typeof a.description === 'string' ? a.description : '',
      achieved: a.achieved === 1,
      unlockedAt: a.achieved === 1 ? toIso(a.unlocktime) : null,
    }));
    achievements.sort(
      (a, b) => Number(b.achieved) - Number(a.achieved) || (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''),
    );
    return { supported: achievements.length > 0, private: false, achievements };
  });
}
