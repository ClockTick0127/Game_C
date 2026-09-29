import { RAWG_API_KEY } from '../config.ts';
import type { Game } from '../types.ts';
import { HttpError } from '../utils/http.ts';
import { isAdultGame } from './contentFilter.ts';
import { dedupeGames } from './dedupe.ts';

const BASE_URL = 'https://api.rawg.io/api';
/** RAWG가 허용하는 최대 페이지 크기 */
const PAGE_SIZE = 40;
/** 한 번에 가져올 최대 페이지 수. 인기순 정렬이라 상위 게임 위주로 채워진다. */
const MAX_PAGES = 3;
const TIMEOUT_MS = 10_000;

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

/** RAWG 호출 실패. message는 클라이언트에 그대로 보여줄 수 있는 문장이다. */
export class RawgApiError extends HttpError {
  constructor(message: string, status = 502) {
    super(status, message);
    this.name = 'RawgApiError';
  }
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
  const query = new URLSearchParams({ key: RAWG_API_KEY, ...params });
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}?${query}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new RawgApiError('RAWG 응답 시간이 초과되었습니다.', 504);
    }
    throw new RawgApiError('RAWG 서버에 연결할 수 없습니다.');
  }

  if (res.status === 401) {
    throw new RawgApiError('RAWG API 키가 올바르지 않습니다. backend/.env의 RAWG_API_KEY를 확인하세요.');
  }
  if (res.status === 404) {
    throw new RawgApiError('게임을 찾을 수 없습니다.', 404);
  }
  if (!res.ok) {
    throw new RawgApiError(`RAWG API 요청 실패 (HTTP ${res.status})`);
  }
  return (await res.json()) as T;
}

/** start ~ end(YYYY-MM-DD, 양 끝 포함) 기간에 출시되는 게임을 인기순으로 가져온다. */
export async function fetchReleases(start: string, end: string): Promise<Game[]> {
  const games: Game[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await rawgGet<RawgListResponse>('/games', {
      dates: `${start},${end}`,
      ordering: '-added',
      page_size: String(PAGE_SIZE),
      page: String(page),
    });
    for (const raw of data.results) {
      if (raw.released && !isAdultGame(raw)) games.push(normalize(raw));
    }
    if (!data.next) break;
  }

  return dedupeGames(games);
}

export interface RawgStoreLink {
  /** RAWG 스토어 번호 (1: Steam, 11: Epic Games 등 — storeInfo.ts 참고) */
  storeId: number;
  url: string;
}

/** 게임 이름과 플랫폼(slug: 'pc', 'playstation5' 등) */
export async function fetchGameBasics(gameId: number): Promise<{ name: string; platforms: string[] }> {
  const data = await rawgGet<{ name: string; platforms: { platform: { slug: string } }[] | null }>(`/games/${gameId}`);
  return { name: data.name, platforms: data.platforms?.map((p) => p.platform.slug) ?? [] };
}

/** 게임의 스토어별 판매 페이지 링크. (게임 상세 API에는 링크가 빠져 있어 별도 API를 쓴다) */
export async function fetchStoreLinks(gameId: number): Promise<RawgStoreLink[]> {
  const data = await rawgGet<{ results: { store_id: number; url: string }[] }>(`/games/${gameId}/stores`);
  return data.results.map((s) => ({ storeId: s.store_id, url: s.url }));
}
