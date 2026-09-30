import { RAWG_API_KEY, RAWG_MAX_CALLS_PER_MINUTE } from '../config.ts';
import type { Game, RelatedGame, RelatedGames } from '../types.ts';
import { HttpError } from '../utils/http.ts';
import { isAdultGame } from './contentFilter.ts';
import { dedupeGames } from './dedupe.ts';

const BASE_URL = 'https://api.rawg.io/api';
/** RAWG가 허용하는 최대 페이지 크기 */
const PAGE_SIZE = 40;
/** 한 번에 가져올 최대 페이지 수. 인기순 정렬이라 상위 게임 위주로 채워진다. */
const MAX_PAGES = 3;
/** 화면(15초)이 먼저 포기하지 않도록 첫 페이지 → 나머지 페이지(병렬) 두 번의 대기가 합쳐도 그 안에 끝나게 잡는다 */
const TIMEOUT_MS = 6_000;

interface RawgGame {
  id: number;
  slug: string;
  name: string;
  released: string | null;
  background_image: string | null;
  rating: number;
  metacritic: number | null;
  platforms: { platform: { id: number; name: string } }[] | null;
  genres: { id: number; name: string }[] | null;
  tags: { slug: string }[] | null;
  esrb_rating: { slug: string } | null;
}

interface RawgListResponse {
  count: number;
  next: string | null;
  results: RawgGame[];
}

/** RAWG 호출 실패. message는 클라이언트에 그대로 보여줄 수 있는 문장이고, 내부 사정은 detail에만 담는다. */
export class RawgApiError extends HttpError {
  constructor(message: string, status = 502, detail?: string) {
    super(status, message, detail);
    this.name = 'RawgApiError';
  }
}

/** 최근 1분 동안 RAWG로 요청을 보낸 시각. 서버 전체의 호출량을 세어 무료 요금제 한도가 한꺼번에 소진되는 것을 막는다. */
const recentCalls: number[] = [];

function takeUpstreamSlot(): void {
  const now = Date.now();
  while (recentCalls.length > 0 && recentCalls[0]! <= now - 60_000) recentCalls.shift();
  if (recentCalls.length >= RAWG_MAX_CALLS_PER_MINUTE) {
    throw new RawgApiError(
      '요청이 몰려 잠시 후 다시 시도해 주세요.',
      503,
      `RAWG 호출 상한(분당 ${RAWG_MAX_CALLS_PER_MINUTE}회)에 도달했습니다. RAWG_MAX_CALLS_PER_MINUTE로 조정할 수 있습니다.`,
    );
  }
  recentCalls.push(now);
}

/**
 * RAWG 원본 이미지는 최대 4K라 캘린더 썸네일로 수십 장을 받으면 매우 무겁다.
 * RAWG가 제공하는 리사이즈 경로(/media/resize/640/-/...)로 바꿔 가로 640px 이미지를 받는다.
 */
function resizeImage(url: string | null): string | null {
  return url?.replace(/\/media\/(games|screenshots)\//, '/media/resize/640/-/$1/') ?? null;
}

function normalize(game: RawgGame): Game {
  return {
    id: game.id,
    name: game.name,
    released: game.released ?? '',
    image: resizeImage(game.background_image),
    rating: game.rating,
    metacritic: game.metacritic,
    platforms: game.platforms?.map((p) => p.platform.name) ?? [],
    genres: game.genres?.map((g) => g.name) ?? [],
    url: `https://rawg.io/games/${game.slug}`,
  };
}

async function rawgGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  takeUpstreamSlot();
  const query = new URLSearchParams({ key: RAWG_API_KEY, ...params });
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}?${query}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new RawgApiError(
        'RAWG 응답 시간이 초과되었습니다.',
        504,
        `RAWG가 ${TIMEOUT_MS / 1000}초 안에 응답하지 않았습니다.`,
      );
    }
    const cause = err instanceof Error ? ((err.cause as Error | undefined)?.message ?? err.message) : String(err);
    throw new RawgApiError('RAWG 서버에 연결할 수 없습니다.', 502, `RAWG 연결 실패: ${cause}`);
  }

  if (res.status === 401) {
    // 키 설정 문제는 사용자가 고칠 수 없으므로 화면에는 일반 안내만 보내고, 원인은 서버 로그에 남긴다
    throw new RawgApiError(
      '게임 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
      502,
      'RAWG API 키가 올바르지 않습니다. backend/.env의 RAWG_API_KEY를 확인하세요.',
    );
  }
  if (res.status === 429) {
    throw new RawgApiError(
      '요청이 몰려 잠시 후 다시 시도해 주세요.',
      503,
      'RAWG가 요청 한도 초과(429)를 응답했습니다. 요금제 한도를 확인하세요.',
    );
  }
  if (res.status === 404) {
    throw new RawgApiError('게임을 찾을 수 없습니다.', 404);
  }
  if (!res.ok) {
    throw new RawgApiError(`RAWG API 요청 실패 (HTTP ${res.status})`);
  }
  return (await res.json()) as T;
}

export interface ReleasesResult {
  games: Game[];
  /** 일부 페이지를 가져오지 못해 목록이 완전하지 않다 */
  partial: boolean;
}

/**
 * start ~ end(YYYY-MM-DD, 양 끝 포함) 기간에 출시되는 게임을 인기순으로 가져온다.
 * 첫 페이지로 전체 개수를 알아낸 뒤 나머지 페이지는 동시에 요청한다. 첫 페이지가 실패하면 오류지만,
 * 나머지 페이지가 실패했을 때는 받은 것만으로 응답하고 partial로 표시한다.
 */
export async function fetchReleases(start: string, end: string): Promise<ReleasesResult> {
  const fetchPage = (page: number) =>
    rawgGet<RawgListResponse>('/games', {
      dates: `${start},${end}`,
      ordering: '-added',
      page_size: String(PAGE_SIZE),
      page: String(page),
    });

  const first = await fetchPage(1);
  const pageCount = first.next ? Math.min(MAX_PAGES, Math.max(2, Math.ceil(first.count / PAGE_SIZE))) : 1;
  const rest = await Promise.allSettled(Array.from({ length: pageCount - 1 }, (_, i) => fetchPage(i + 2)));

  const pages = [first];
  let partial = false;
  for (const result of rest) {
    if (result.status === 'fulfilled') {
      pages.push(result.value);
    } else {
      partial = true;
      const reason = result.reason as unknown;
      console.warn(
        `RAWG 일부 페이지를 가져오지 못했습니다 (${start}~${end}):`,
        reason instanceof HttpError ? (reason.detail ?? reason.message) : reason,
      );
    }
  }

  const games: Game[] = [];
  for (const page of pages) {
    for (const raw of page.results) {
      if (raw.released && !isAdultGame(raw)) games.push(normalize(raw));
    }
  }
  return { games: dedupeGames(games), partial };
}

export interface RawgStoreLink {
  /** RAWG 스토어 번호 (1: Steam, 11: Epic Games 등 — storeInfo.ts 참고) */
  storeId: number;
  url: string;
}

export interface RawgGameInfo {
  name: string;
  /** 플랫폼 slug ('pc', 'playstation5' 등) */
  platforms: string[];
  /** 영어 설명(HTML 제거된 텍스트) */
  description: string | null;
  developers: string[];
  publishers: string[];
  /** 영어 태그 이름 (인기순) */
  tags: string[];
  ageRating: string | null;
  playtimeHours: number | null;
  website: string | null;
}

interface RawgGameDetail {
  name: string;
  platforms: { platform: { slug: string } }[] | null;
  description_raw?: string | null;
  developers?: { name: string }[] | null;
  publishers?: { name: string }[] | null;
  tags?: { name: string; language: string }[] | null;
  esrb_rating?: { name: string } | null;
  playtime?: number | null;
  website?: string | null;
}

const MAX_TAGS = 8;

/** 게임 이름·플랫폼과 소개·제작 정보 (RAWG 게임 상세 API 한 번으로 가져온다) */
export async function fetchGameInfo(gameId: number): Promise<RawgGameInfo> {
  const data = await rawgGet<RawgGameDetail>(`/games/${gameId}`);
  return {
    name: data.name,
    platforms: data.platforms?.map((p) => p.platform.slug) ?? [],
    description: data.description_raw?.trim() || null,
    developers: data.developers?.map((d) => d.name) ?? [],
    publishers: data.publishers?.map((p) => p.name) ?? [],
    tags:
      data.tags
        ?.filter((t) => t.language === 'eng')
        .map((t) => t.name)
        .slice(0, MAX_TAGS) ?? [],
    ageRating: data.esrb_rating?.name ?? null,
    // 0은 "데이터 없음"이다
    playtimeHours: data.playtime && data.playtime > 0 ? data.playtime : null,
    website: data.website?.startsWith('https://') ? data.website : null,
  };
}

const MAX_RELATED = 6;

async function fetchRelatedList(gameId: number, kind: 'additions' | 'game-series'): Promise<RelatedGame[]> {
  const data = await rawgGet<{ results: RawgGame[] }>(`/games/${gameId}/${kind}`, { page_size: '20' });
  return data.results
    .filter((g) => !isAdultGame(g))
    .map((g) => ({ id: g.id, name: g.name, released: g.released }))
    .slice(0, MAX_RELATED);
}

/** DLC·확장팩·에디션과 같은 시리즈의 다른 게임 */
export async function fetchRelatedGames(gameId: number): Promise<RelatedGames> {
  const [additions, series] = await Promise.all([
    fetchRelatedList(gameId, 'additions'),
    fetchRelatedList(gameId, 'game-series'),
  ]);
  return { additions, series };
}

/** 게임의 스토어별 판매 페이지 링크. (게임 상세 API에는 링크가 빠져 있어 별도 API를 쓴다) */
export async function fetchStoreLinks(gameId: number): Promise<RawgStoreLink[]> {
  const data = await rawgGet<{ results: { store_id: number; url: string }[] }>(`/games/${gameId}/stores`);
  return data.results.map((s) => ({ storeId: s.store_id, url: s.url }));
}

/**
 * 이름으로 게임 하나를 찾는다. 이름이 정확히 같은 결과를 우선하고, year(출시 연도)가 주어지면 그 해에 나온 것을 먼저 고른다.
 * (같은 이름의 리메이크·후속작이 함께 검색되는 경우가 있다. 예: 2018년 "God of War"와 2022년 PC판 항목)
 */
export async function searchGameByName(name: string, year?: number): Promise<Game | null> {
  const data = await rawgGet<RawgListResponse>('/games', {
    search: name,
    search_precise: 'true',
    page_size: '10',
  });
  const wanted = name.trim().toLowerCase();
  const exact = data.results.filter((g) => g.name.toLowerCase() === wanted);
  const sameYear = (g: RawgGame) => year !== undefined && g.released?.startsWith(String(year));
  const match =
    exact.find(sameYear) ??
    data.results.find((g) => sameYear(g) && g.name.toLowerCase().startsWith(wanted)) ??
    exact[0] ??
    data.results[0];
  return match ? normalize(match) : null;
}
