import { db } from '../db.ts';
import type { Game } from '../types.ts';
import { createPromiseCache } from '../utils/cache.ts';
import { isDateKey, toDateKey } from '../utils/date.ts';
import { HttpError } from '../utils/http.ts';
import { addFavorite, listFavorites } from './favorites.ts';
import { searchGamesExact } from './rawg.ts';

const API = 'https://api.steampowered.com';
const TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
/** 스토어 정보를 한 번에 물어볼 앱 수 */
const ITEMS_BATCH = 50;
/** RAWG에서 못 찾은 게임을 다시 찾아보기까지의 시간 (신작은 RAWG에 늦게 올라온다) */
const RETRY_NOT_FOUND_MS = 7 * 24 * 60 * 60 * 1000;
/** 한 번의 요청으로 가져올 수 있는 게임 수. 게임마다 RAWG 검색이 나가므로 화면이 나눠서 부른다 */
export const MAX_IMPORT_PER_REQUEST = 10;

/** 위시리스트의 게임 한 건 (Steam 스토어 기준) */
export interface WishlistItem {
  appId: number;
  name: string;
  /** Steam이 알려 준 출시일 (YYYY-MM-DD). 출시일 미정이면 null */
  released: string | null;
  image: string;
}

export interface Wishlist {
  /** 위시리스트에 담은 순서(우선순위를 정했으면 그 순서, 나머지는 최근에 담은 것부터) */
  items: WishlistItem[];
  /** DLC·데모처럼 게임이 아니어서 뺀 항목 수 */
  excluded: number;
}

export interface ImportResult {
  appId: number;
  /**
   * added: 관심 게임에 추가함 · exists: 이미 관심 게임 · notFound: RAWG에 같은 이름의 게임이 없음 ·
   * noDate: 출시일을 몰라 캘린더에 넣을 수 없음 · error: RAWG 조회 실패(시간 초과, 한도 초과 등)라 나중에 다시 시도
   */
  status: 'added' | 'exists' | 'notFound' | 'noDate' | 'error';
  /** 짝지은 RAWG 게임. notFound·error면 null */
  game: Game | null;
  /** error일 때 사용자에게 보여줄 사유 */
  message?: string;
}

interface WishlistEntry {
  appid: number;
  priority: number;
  date_added: number;
}

interface StoreItem {
  appid?: number;
  success?: number;
  visible?: boolean;
  name?: string;
  /** 0: 게임, 4: DLC 등 */
  type?: number;
  release?: { steam_release_date?: number };
}

/** Steam 공개 API 호출 (키 불필요). 서버 오류나 연결 실패는 502로 알린다 */
async function steamGet(path: string, params: Record<string, string>): Promise<unknown> {
  try {
    const res = await fetch(`${API}${path}?${new URLSearchParams(params)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    throw new HttpError(
      502,
      'Steam에서 정보를 가져오지 못했습니다. 잠시 후 다시 시도하세요.',
      `${path} 실패: ${err instanceof Error ? err.message : err}`,
    );
  }
}

/** 위시리스트에 담은 앱 번호들. 비공개이거나 비어 있으면 빈 배열 (Steam은 둘을 구분해 주지 않는다) */
async function fetchWishlistEntries(steamId: string): Promise<WishlistEntry[]> {
  const body = (await steamGet('/IWishlistService/GetWishlist/v1/', { steamid: steamId })) as {
    response?: { items?: Record<string, unknown>[] };
  } | null;
  return (body?.response?.items ?? [])
    .filter((e) => Number.isSafeInteger(e.appid) && (e.appid as number) > 0)
    .map((e) => ({
      appid: e.appid as number,
      priority: typeof e.priority === 'number' ? e.priority : 0,
      date_added: typeof e.date_added === 'number' ? e.date_added : 0,
    }))
    .sort((a, b) => {
      // 우선순위(1이 맨 위)를 정한 게임이 먼저, 정하지 않은 게임(0)은 최근에 담은 순
      if (a.priority > 0 && b.priority > 0) return a.priority - b.priority;
      if (a.priority > 0 || b.priority > 0) return a.priority > 0 ? -1 : 1;
      return b.date_added - a.date_added;
    });
}

/** 앱 번호들의 스토어 정보(이름·종류·출시일). 없는 앱은 빠진다 */
async function fetchStoreItems(appIds: number[]): Promise<Map<number, StoreItem>> {
  const items = new Map<number, StoreItem>();
  for (let i = 0; i < appIds.length; i += ITEMS_BATCH) {
    const batch = appIds.slice(i, i + ITEMS_BATCH);
    const body = (await steamGet('/IStoreBrowseService/GetItems/v1/', {
      input_json: JSON.stringify({
        ids: batch.map((appid) => ({ appid })),
        context: { language: 'english', country_code: 'KR' },
        data_request: { include_release: true },
      }),
    })) as { response?: { store_items?: StoreItem[] } } | null;
    for (const item of body?.response?.store_items ?? []) {
      if (item.success === 1 && item.visible !== false && Number.isSafeInteger(item.appid))
        items.set(item.appid!, item);
    }
  }
  return items;
}

function releaseDate(item: StoreItem): string | null {
  const seconds = item.release?.steam_release_date;
  return typeof seconds === 'number' && seconds > 0 ? toDateKey(new Date(seconds * 1000)) : null;
}

const wishlistCache = createPromiseCache<string, Wishlist>({ ttlMs: CACHE_TTL_MS, maxEntries: 500 });

/** 위시리스트에 담은 게임 목록. 이름과 출시일은 Steam 스토어에서 가져온다 */
export function fetchWishlist(steamId: string): Promise<Wishlist> {
  return wishlistCache(steamId, async () => {
    const entries = await fetchWishlistEntries(steamId);
    const store = await fetchStoreItems(entries.map((e) => e.appid));
    const items: WishlistItem[] = [];
    let excluded = 0;
    for (const { appid } of entries) {
      const item = store.get(appid);
      if (!item || typeof item.name !== 'string' || !item.name) continue; // 스토어에서 내려간 앱
      if (item.type !== 0) {
        excluded++;
        continue;
      }
      items.push({
        appId: appid,
        name: item.name,
        released: releaseDate(item),
        image: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
      });
    }
    return { items, excluded };
  });
}

// --- Steam 앱 → RAWG 게임 대응 ---

const selectMatch = db.prepare('SELECT game, checked_at FROM steam_rawg_matches WHERE steam_app_id = ?');
const selectMatches = db.prepare('SELECT steam_app_id, game FROM steam_rawg_matches WHERE game IS NOT NULL');
const upsertMatch = db.prepare(`
  INSERT INTO steam_rawg_matches (steam_app_id, game, checked_at) VALUES (?, ?, ?)
  ON CONFLICT (steam_app_id) DO UPDATE SET game = excluded.game, checked_at = excluded.checked_at
`);

/**
 * Steam 게임과 같은 RAWG 게임을 찾는다. 이름이 정확히 같은 것만 인정하고, 같은 이름이 여럿이면 출시 연도가 같은 것을 고른다.
 * 결과는 대응표에 남겨 다음부터는 RAWG를 부르지 않는다.
 */
async function matchRawgGame(item: WishlistItem): Promise<Game | null> {
  const row = selectMatch.get(item.appId) as { game: string | null; checked_at: number } | undefined;
  if (row && (row.game !== null || Date.now() - row.checked_at < RETRY_NOT_FOUND_MS)) {
    return row.game === null ? null : (JSON.parse(row.game) as Game);
  }

  const candidates = await searchGamesExact(item.name);
  const year = item.released?.slice(0, 4);
  const match = (year && candidates.find((g) => g.released.startsWith(year))) || candidates[0] || null;
  upsertMatch.run(item.appId, match ? JSON.stringify(match) : null, Date.now());
  return match;
}

/** 이미 대응표에 있는 앱 중 이 사용자의 관심 게임인 것 (화면에서 "이미 추가됨"으로 표시) */
export function favoriteAppIds(userId: number, appIds: number[]): Set<number> {
  const favorites = new Set(listFavorites(userId).map((g) => g.id));
  const wanted = new Set(appIds);
  const result = new Set<number>();
  for (const row of selectMatches.all() as unknown as { steam_app_id: number; game: string }[]) {
    if (wanted.has(row.steam_app_id) && favorites.has((JSON.parse(row.game) as Game).id)) result.add(row.steam_app_id);
  }
  return result;
}

/**
 * 위시리스트의 게임들을 관심 게임에 추가한다. RAWG 검색이 게임마다 한 번씩 나가므로 화면이 기다릴 수 있도록
 * 한 요청 안에서는 병렬로 찾고, 한 게임의 조회가 실패해도(시간 초과 등) 나머지는 계속 처리해 게임별로 결과를 알린다.
 */
export async function importWishlistGames(userId: number, steamId: string, appIds: number[]): Promise<ImportResult[]> {
  const { items } = await fetchWishlist(steamId);
  const byAppId = new Map(items.map((item) => [item.appId, item]));
  const favorites = new Set(listFavorites(userId).map((g) => g.id));

  const matches = await Promise.all(
    appIds.map(async (appId) => {
      const item = byAppId.get(appId);
      if (!item) return { appId, item: null, match: null, error: null };
      try {
        return { appId, item, match: await matchRawgGame(item), error: null };
      } catch (err) {
        // RAWG 문제(시간 초과, 한도 초과 등)는 이 게임만 실패로 표시한다. 그 밖의 예외는 서버 오류다
        if (err instanceof HttpError) return { appId, item, match: null, error: err.message };
        throw err;
      }
    }),
  );

  const results: ImportResult[] = [];
  for (const { appId, item, match, error } of matches) {
    if (error !== null) {
      results.push({ appId, status: 'error', game: null, message: error });
      continue;
    }
    if (!item || !match) {
      results.push({ appId, status: 'notFound', game: null });
      continue;
    }
    // RAWG에 출시일이 없으면(TBA) Steam이 알려 준 날짜로 대신한다. 둘 다 없으면 캘린더에 넣을 수 없다
    const released = isDateKey(match.released) ? match.released : item.released;
    if (!released) {
      results.push({ appId, status: 'noDate', game: match });
      continue;
    }
    const game = { ...match, released };
    if (favorites.has(game.id)) {
      results.push({ appId, status: 'exists', game });
      continue;
    }
    addFavorite(userId, game);
    favorites.add(game.id);
    results.push({ appId, status: 'added', game });
  }
  return results;
}

/** 요청 본문의 appIds 검증: 1~10개의 양의 정수, 중복 제거 */
export function parseAppIds(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_IMPORT_PER_REQUEST) {
    throw new HttpError(400, `게임은 한 번에 1~${MAX_IMPORT_PER_REQUEST}개씩 가져올 수 있습니다.`);
  }
  if (!value.every((id) => Number.isSafeInteger(id) && id > 0))
    throw new HttpError(400, '게임 ID가 올바르지 않습니다.');
  return [...new Set(value as number[])];
}
