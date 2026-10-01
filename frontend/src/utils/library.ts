import { formatPlaytime } from './steam';
import type { CustomGame, GameLog, GameStatus, ShowcaseGame, SteamOwnedGame } from '../types';

export type LibrarySort = 'playtime' | 'recent' | 'name';

export const SORT_LABELS: Record<LibrarySort, string> = {
  playtime: '플레이 시간 순',
  recent: '최근 플레이 순',
  name: '이름 순',
};

/** 진열장의 게임 상자에 쓰는 세로형 표지. 없는 게임이 있어서 가로형 헤더, 그마저 없으면 글자 표지로 물러난다 */
export const coverUrls = (appId: number) => [
  `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
  `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
];

/**
 * 직접 추가한 게임의 서재 번호. RAWG 번호에 큰 수를 더해 Steam 앱 번호와 겹치지 않게 한다
 * (배치 목록이 두 종류를 한 줄로 저장하기 때문이다).
 */
export const CUSTOM_ID_BASE = 1_000_000_000;

export const toLibraryId = (rawgId: number) => CUSTOM_ID_BASE + rawgId;
export const isCustomId = (id: number) => id >= CUSTOM_ID_BASE;
export const toRawgId = (id: number) => id - CUSTOM_ID_BASE;

/** 직접 추가한 게임을 서재에서 쓰는 게임 모양으로 바꾼다 */
export function customToOwned(game: CustomGame): SteamOwnedGame {
  // Steam에도 있는 게임은 공식 세로 표지를 쓰고, 없으면 RAWG의 게임 화면을 쓴다
  const steamCover = game.steamAppId ? coverUrls(game.steamAppId)[0]! : null;
  const cover = steamCover ?? game.image;
  return {
    appId: toLibraryId(game.id),
    name: game.name,
    playtimeMinutes: 0,
    lastPlayedAt: null,
    image: cover ?? '',
    iconUrl: cover,
    persona: null,
    custom: true,
    coverUrl: cover,
    steamAppId: game.steamAppId ?? null,
  };
}

/** 공개 진열장의 게임을 상자(GameCase)가 그릴 수 있는 모양으로 바꾼다. 같이 올 기록은 메모 없이 상태·별점뿐이다 */
export function showcaseToOwned(game: ShowcaseGame): { game: SteamOwnedGame; log: GameLog | undefined } {
  const owned: SteamOwnedGame = game.custom
    ? customToOwned({ id: toRawgId(game.appId), name: game.name, image: game.image, steamAppId: game.steamAppId })
    : {
        appId: game.appId,
        name: game.name,
        playtimeMinutes: game.playtimeMinutes,
        lastPlayedAt: null,
        image: `https://cdn.akamai.steamstatic.com/steam/apps/${game.appId}/header.jpg`,
        iconUrl: null,
        persona: null,
      };
  const hasLog = game.status !== null || game.rating !== null;
  return {
    game: owned,
    log: hasLog ? { gameId: game.appId, status: game.status, rating: game.rating, note: '' } : undefined,
  };
}

/** 상자·책에 붙는 플레이 시간 문구. 직접 추가한 게임은 기록이 없으니 그렇게 알린다 */
export const playtimeLabel = (game: SteamOwnedGame) =>
  game.custom ? '직접 추가한 게임' : formatPlaytime(game.playtimeMinutes);

/** 플레이 상태. 보여 주는 순서이기도 하다 */
export const GAME_STATUSES: GameStatus[] = ['playing', 'cleared', 'backlog', 'dropped'];

export const STATUS_LABELS: Record<GameStatus, string> = {
  playing: '하는 중',
  cleared: '클리어',
  backlog: '쌓아둠',
  dropped: '포기',
};

/** 책등·상자에 붙는 배지 글자. 색만으로 구분하지 않도록 모양도 다르게 한다 */
export const STATUS_ICONS: Record<GameStatus, string> = {
  playing: '▶',
  cleared: '✓',
  backlog: '≡',
  dropped: '✕',
};

/** 메모 글자 수 한도 (서버와 같다) */
export const MAX_NOTE_LENGTH = 200;

/** "클리어 · ★4". 상태도 별점도 없으면(메모만 있으면) 빈 문자열 */
export function logSummary(log: GameLog | undefined): string {
  if (!log) return '';
  return [log.status && STATUS_LABELS[log.status], log.rating !== null && `★${log.rating}`].filter(Boolean).join(' · ');
}

/** 상자·책에 붙는 안내 문구: 플레이 시간과, 남겨 둔 기록이 있으면 상태·별점 */
export const gameLabel = (game: SteamOwnedGame, log: GameLog | undefined) =>
  [playtimeLabel(game), logSummary(log)].filter(Boolean).join(' · ');

/** 서재에서 고를 수 있는 상태 필터. none은 상태를 정하지 않은 게임 */
export type StatusFilter = 'all' | 'none' | GameStatus;

export const STATUS_FILTER_LABELS: Record<StatusFilter, string> = {
  all: '모든 상태',
  ...STATUS_LABELS,
  none: '상태 없음',
};

/** 고른 상태의 게임만 남긴다. 기록은 서재 번호(appId)로 찾는다 */
export function filterByStatus(
  games: SteamOwnedGame[],
  logs: Record<number, GameLog>,
  filter: StatusFilter,
): SteamOwnedGame[] {
  if (filter === 'all') return games;
  return games.filter((g) => {
    const status = logs[g.appId]?.status ?? null;
    return filter === 'none' ? status === null : status === filter;
  });
}

/** 게임마다 정해지는 책등 색상(0~359). 같은 게임은 항상 같은 색이다 */
export function spineHue(appId: number): number {
  return (appId * 137) % 360;
}

/** "최근 플레이"에 보여 줄 최대 게임 수 */
export const MAX_RECENT = 6;

/** 최근 2주에 플레이한 게임을 많이 한 순서로 (직접 추가한 게임은 기록이 없어 빠진다) */
export function recentGames(games: SteamOwnedGame[]): SteamOwnedGame[] {
  return games
    .filter((g) => (g.recentMinutes ?? 0) > 0)
    .sort((a, b) => (b.recentMinutes ?? 0) - (a.recentMinutes ?? 0))
    .slice(0, MAX_RECENT);
}

/** 검색어로 거른 뒤 정렬한다 */
export function filterAndSort(games: SteamOwnedGame[], query: string, sort: LibrarySort): SteamOwnedGame[] {
  const q = query.trim().toLowerCase();
  const list = q ? games.filter((g) => g.name.toLowerCase().includes(q)) : [...games];
  const byName = (a: SteamOwnedGame, b: SteamOwnedGame) => a.name.localeCompare(b.name, 'ko');
  if (sort === 'name') return list.sort(byName);
  if (sort === 'recent') {
    // 플레이 기록이 없는 게임(null)은 맨 뒤로
    return list.sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? '') || byName(a, b));
  }
  return list.sort((a, b) => b.playtimeMinutes - a.playtimeMinutes || byName(a, b));
}

/**
 * id를 targetId가 있던 자리에 꽂는다. list 안에 이미 있으면 옮기는 것이고(사이 항목은 한 칸씩 밀린다),
 * 없으면 targetId 앞에 끼워 넣는다. targetId가 null이면 맨 뒤에 꽂는다.
 */
export function placeAt(list: number[], id: number, targetId: number | null): number[] {
  if (id === targetId) return list;
  const to = targetId === null ? -1 : list.indexOf(targetId);
  if (targetId !== null && to < 0) return list;
  const next = list.filter((x) => x !== id);
  if (targetId === null) next.push(id);
  else next.splice(to, 0, id);
  return next;
}

export const removeFrom = (list: number[], id: number): number[] => list.filter((x) => x !== id);

/** 전체 플레이 시간(분)을 "1,234시간"으로 */
export function formatTotalHours(minutes: number): string {
  return `${Math.round(minutes / 60).toLocaleString('ko-KR')}시간`;
}
