import type { Game } from '../types.ts';

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
}

interface RawgListResponse {
  count: number;
  next: string | null;
  results: RawgGame[];
}

/** RAWG 호출 실패. message는 클라이언트에 그대로 보여줄 수 있는 문장이다. */
export class RawgApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'RawgApiError';
    this.status = status;
  }
}

function normalize(game: RawgGame): Game {
  return {
    id: game.id,
    name: game.name,
    released: game.released ?? '',
    image: game.background_image,
    rating: game.rating,
    metacritic: game.metacritic,
    platforms: game.platforms?.map((p) => p.platform.name) ?? [],
    genres: game.genres?.map((g) => g.name) ?? [],
    url: `https://rawg.io/games/${game.slug}`,
  };
}

async function requestGames(params: URLSearchParams): Promise<RawgListResponse> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/games?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new RawgApiError('RAWG 응답 시간이 초과되었습니다.', 504);
    }
    throw new RawgApiError('RAWG 서버에 연결할 수 없습니다.');
  }

  if (res.status === 401) {
    throw new RawgApiError('RAWG API 키가 올바르지 않습니다. backend/.env의 RAWG_API_KEY를 확인하세요.');
  }
  if (!res.ok) {
    throw new RawgApiError(`RAWG API 요청 실패 (HTTP ${res.status})`);
  }
  return (await res.json()) as RawgListResponse;
}

/** start ~ end(YYYY-MM-DD, 양 끝 포함) 기간에 출시되는 게임을 인기순으로 가져온다. */
export async function fetchReleases(start: string, end: string, apiKey: string): Promise<Game[]> {
  const games: Game[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await requestGames(
      new URLSearchParams({
        key: apiKey,
        dates: `${start},${end}`,
        ordering: '-added',
        page_size: String(PAGE_SIZE),
        page: String(page),
      }),
    );
    for (const raw of data.results) {
      if (raw.released) games.push(normalize(raw));
    }
    if (!data.next) break;
  }

  return games;
}
