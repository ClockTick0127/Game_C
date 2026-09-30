import { POPULAR_STEAMSPY_GAP_MS, POPULAR_STORE_GAP_MS } from '../config.ts';
import { db } from '../db.ts';

/**
 * "인기 있는 게임": SteamSpy의 보유자 수 추정치로 정렬한 Steam 게임 목록.
 *
 * SteamSpy의 top100 요청은 보유자 순이 아니라 앱 번호 순 묶음이고, 전체(all)는 페이지당 60초 제한이라 2시간 가까이 걸린다.
 * 대신 장르별 요청(genre)은 한 번에 그 장르의 모든 게임을 주므로, 주요 장르를 받아 합쳐서 직접 정렬한다.
 * SteamSpy에는 출시 연도·플랫폼이 없어서 Steam 스토어 API로 게임마다 천천히 채운다(한 번 받으면 다시 받지 않는다).
 */

/** 수집·필터에 쓰는 Steam 장르 (SteamSpy 표기 그대로) */
export const GENRES = [
  'Action',
  'Adventure',
  'Casual',
  'Indie',
  'Massively Multiplayer',
  'Racing',
  'RPG',
  'Simulation',
  'Sports',
  'Strategy',
  'Free To Play',
] as const;

export type Platform = 'windows' | 'mac' | 'linux';
export const PLATFORMS: readonly Platform[] = ['windows', 'mac', 'linux'];

/** 이 미만의 보유자 구간은 목록에 넣지 않는다 (수만 개라 의미 있는 비교가 어렵고 용량도 커진다) */
const MIN_OWNERS = 1_000_000;
/** SteamSpy 데이터는 하루 한 번 갱신된다 */
const REFRESH_MS = 24 * 60 * 60 * 1000;
/** 수집이나 조회가 실패한 뒤 다시 시도하기까지의 대기 시간 */
const RETRY_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 120_000;

export interface PopularGame {
  appId: number;
  name: string;
  developer: string;
  publisher: string;
  /** 보유자 수 추정 구간. SteamSpy는 정확한 수가 아니라 구간만 준다 */
  ownersMin: number;
  ownersMax: number;
  /** 어제 기준 최대 동시 접속자 수 */
  ccu: number;
  /** 미국 스토어 기준 현재 가격(USD). 무료면 0 */
  priceUsd: number | null;
  discount: number;
  genres: string[];
  /** 아직 Steam 스토어에서 받아오지 못했으면 null */
  releaseYear: number | null;
  platforms: Record<Platform, boolean> | null;
  image: string;
}

interface Row {
  appid: number;
  name: string;
  developer: string;
  publisher: string;
  owners_min: number;
  owners_max: number;
  ccu: number;
  price_cents: number | null;
  discount: number;
  genres: string;
  release_year: number | null;
  windows: number | null;
  mac: number | null;
  linux: number | null;
  release_checked: number;
  crawled_at: number;
}

const upsert = db.prepare(`
  INSERT INTO popular_games
    (appid, name, developer, publisher, owners_min, owners_max, ccu, price_cents, discount, genres, crawled_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(appid) DO UPDATE SET
    name = excluded.name, developer = excluded.developer, publisher = excluded.publisher,
    owners_min = excluded.owners_min, owners_max = excluded.owners_max, ccu = excluded.ccu,
    price_cents = excluded.price_cents, discount = excluded.discount, genres = excluded.genres,
    crawled_at = excluded.crawled_at
`);
const deleteOlder = db.prepare('DELETE FROM popular_games WHERE crawled_at < ?');
const selectAll = db.prepare('SELECT * FROM popular_games');
const selectNextUnchecked = db.prepare(
  'SELECT appid FROM popular_games WHERE release_checked = 0 ORDER BY owners_min DESC, ccu DESC LIMIT 1',
);
const updateRelease = db.prepare(
  'UPDATE popular_games SET release_year = ?, windows = ?, mac = ?, linux = ?, release_checked = 1 WHERE appid = ?',
);
const selectStats = db.prepare(
  'SELECT COUNT(*) AS total, SUM(release_checked) AS checked, MAX(crawled_at) AS crawled_at FROM popular_games',
);

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

/** SteamSpy가 이름 등에 HTML 엔티티를 섞어서 준다 (예: "EA Canada &amp; EA Romania") */
function decodeEntities(text: unknown): string {
  return String(text ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/** "1,000,000 .. 2,000,000" → [1000000, 2000000] */
export function parseOwners(text: unknown): [number, number] | null {
  const parts = String(text ?? '')
    .split('..')
    .map((part) => Number(part.replace(/[,\s]/g, '')));
  return parts.length === 2 && parts.every(Number.isFinite) ? [parts[0]!, parts[1]!] : null;
}

/** Steam이 로캘에 따라 "Aug 3, 2023"이나 "2023년 8월 3일"로 주는 출시일에서 연도만 꺼낸다 */
export function parseYear(text: unknown): number | null {
  const match = /\b(19[7-9]\d|20\d{2})\b/.exec(String(text ?? ''));
  return match ? Number(match[1]) : null;
}

interface SpyGame {
  appid?: number;
  name?: string;
  developer?: string;
  publisher?: string;
  owners?: string;
  ccu?: number;
  price?: string;
  discount?: string;
}

async function fetchGenre(genre: string): Promise<Record<string, SpyGame>> {
  const res = await fetch(`https://steamspy.com/api.php?request=genre&genre=${encodeURIComponent(genre)}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`SteamSpy ${genre}: HTTP ${res.status}`);
  return (await res.json()) as Record<string, SpyGame>;
}

/** 모든 장르를 받아 합친 뒤 통째로 반영한다. 하나라도 실패하면 기존 데이터를 그대로 둔다(일부 장르만 갱신되면 목록이 왜곡된다) */
async function crawl(): Promise<void> {
  const merged = new Map<number, { game: SpyGame; genres: string[] }>();
  for (const [i, genre] of GENRES.entries()) {
    if (i > 0) await sleep(POPULAR_STEAMSPY_GAP_MS);
    for (const game of Object.values(await fetchGenre(genre))) {
      const owners = parseOwners(game.owners);
      // 999999는 개발사 요청으로 데이터를 숨긴 앱이다
      if (!owners || owners[0] < MIN_OWNERS || !Number.isSafeInteger(game.appid) || game.appid === 999999) continue;
      const entry = merged.get(game.appid!) ?? { game, genres: [] };
      entry.genres.push(genre);
      merged.set(game.appid!, entry);
    }
  }
  if (merged.size === 0) throw new Error('SteamSpy 응답에 게임이 없습니다');

  const now = Date.now();
  db.exec('BEGIN');
  try {
    for (const { game, genres } of merged.values()) {
      const owners = parseOwners(game.owners)!;
      const price = Number(game.price);
      upsert.run(
        game.appid!,
        decodeEntities(game.name) || `앱 ${game.appid}`,
        decodeEntities(game.developer),
        decodeEntities(game.publisher),
        owners[0],
        owners[1],
        Number.isFinite(game.ccu) ? game.ccu! : 0,
        game.price !== undefined && Number.isFinite(price) ? price : null,
        Number(game.discount) || 0,
        JSON.stringify(genres),
        now,
      );
    }
    // 이번 수집에 없는 게임(보유자 구간이 내려갔거나 스토어에서 사라진 앱)은 제거한다
    deleteOlder.run(now);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Steam 스토어에서 출시 연도와 플랫폼을 받는다. 스토어에 없는 앱이면 값 없이 조회 완료로 표시한다 */
async function enrichOne(appId: number): Promise<void> {
  const params = new URLSearchParams({
    appids: String(appId),
    filters: 'release_date,platforms',
    l: 'english',
    cc: 'us',
  });
  const res = await fetch(`https://store.steampowered.com/api/appdetails?${params}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // 429 등 호출 제한이나 서버 오류: 이 앱을 조회 완료로 표시하지 않고 중단해서 나중에 다시 받는다
  if (!res.ok) throw new Error(`Steam 스토어 app ${appId}: HTTP ${res.status}`);
  const body = (await res.json()) as Record<
    string,
    { success?: boolean; data?: { release_date?: { date?: string }; platforms?: Partial<Record<Platform, boolean>> } }
  >;
  const entry = body[appId];
  const data = entry?.success && entry.data && !Array.isArray(entry.data) ? entry.data : null;
  const flag = (value: boolean | undefined) => (data?.platforms ? Number(value === true) : null);
  updateRelease.run(
    parseYear(data?.release_date?.date),
    flag(data?.platforms?.windows),
    flag(data?.platforms?.mac),
    flag(data?.platforms?.linux),
    appId,
  );
}

// --- 백그라운드 작업 ---

let crawling: Promise<void> | null = null;
let enriching: Promise<void> | null = null;
let retryAfter = 0;

function fail(what: string, err: unknown): void {
  retryAfter = Date.now() + RETRY_MS;
  console.warn(
    `인기 게임 ${what} 실패 (${RETRY_MS / 60_000}분 뒤 다시 시도):`,
    err instanceof Error ? err.message : err,
  );
}

async function enrichAll(): Promise<void> {
  for (let row = selectNextUnchecked.get() as { appid: number } | undefined; row;) {
    try {
      await enrichOne(row.appid);
    } catch (err) {
      fail('출시 정보 조회', err);
      return;
    }
    await sleep(POPULAR_STORE_GAP_MS);
    row = selectNextUnchecked.get() as { appid: number } | undefined;
  }
}

/** 데이터가 없거나 하루가 지났으면 수집을, 출시 정보가 덜 채워졌으면 보강을 백그라운드에서 시작한다. 이미 돌고 있으면 아무것도 하지 않는다 */
export function ensureFresh(): void {
  if (Date.now() < retryAfter) return;
  const stats = selectStats.get() as { total: number; crawled_at: number | null };

  if (!crawling && (stats.total === 0 || Date.now() - (stats.crawled_at ?? 0) > REFRESH_MS)) {
    crawling = crawl()
      .catch((err) => fail('수집', err))
      .finally(() => {
        crawling = null;
        ensureFresh(); // 수집이 끝나면 곧바로 출시 정보 보강을 이어서 한다
      });
    return;
  }
  if (!crawling && !enriching && stats.total > 0) {
    enriching = enrichAll().finally(() => {
      enriching = null;
    });
  }
}

/** 진행 중인 백그라운드 작업이 끝날 때까지 기다린다 (테스트용) */
export async function whenIdle(): Promise<void> {
  while (crawling || enriching) await Promise.all([crawling, enriching]);
}

// --- 조회 ---

export interface PopularQuery {
  q: string;
  genre: string | null;
  year: number | null;
  platform: Platform | null;
  sort: 'owners' | 'ccu';
  page: number;
  pageSize: number;
}

export interface Facet<T> {
  value: T;
  count: number;
}

export interface PopularResult {
  status: { ready: boolean; updatedAt: string | null; total: number; releaseChecked: number };
  total: number;
  page: number;
  pageSize: number;
  games: PopularGame[];
  facets: { genres: Facet<string>[]; years: Facet<number>[]; platforms: Facet<Platform>[] };
}

function toGame(row: Row): PopularGame {
  return {
    appId: row.appid,
    name: row.name,
    developer: row.developer,
    publisher: row.publisher,
    ownersMin: row.owners_min,
    ownersMax: row.owners_max,
    ccu: row.ccu,
    priceUsd: row.price_cents === null ? null : row.price_cents / 100,
    discount: row.discount,
    genres: JSON.parse(row.genres) as string[],
    releaseYear: row.release_year,
    platforms: row.windows === null ? null : { windows: row.windows === 1, mac: row.mac === 1, linux: row.linux === 1 },
    image: `https://cdn.akamai.steamstatic.com/steam/apps/${row.appid}/header.jpg`,
  };
}

type Filters = Pick<PopularQuery, 'q' | 'genre' | 'year' | 'platform'>;

function matches(game: PopularGame, f: Filters): boolean {
  if (f.q && !game.name.toLowerCase().includes(f.q.toLowerCase())) return false;
  if (f.genre && !game.genres.includes(f.genre)) return false;
  if (f.year !== null && game.releaseYear !== f.year) return false;
  if (f.platform && !game.platforms?.[f.platform]) return false;
  return true;
}

function count<T>(games: PopularGame[], values: (game: PopularGame) => T[]): Facet<T>[] {
  const counts = new Map<T, number>();
  for (const game of games) for (const v of values(game)) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].map(([value, n]) => ({ value, count: n }));
}

/** 같은 구간 안에서는 어제 최대 동시 접속자가 많은 순 (SteamSpy가 보유자 수를 구간으로만 주기 때문) */
const byOwners = (a: PopularGame, b: PopularGame) =>
  b.ownersMin - a.ownersMin || b.ccu - a.ccu || a.name.localeCompare(b.name);
const byCcu = (a: PopularGame, b: PopularGame) => b.ccu - a.ccu || byOwners(a, b);

export function queryPopular(query: PopularQuery): PopularResult {
  const all = (selectAll.all() as unknown as Row[]).map(toGame);
  const stats = selectStats.get() as { total: number; checked: number | null; crawled_at: number | null };

  const filtered = all.filter((game) => matches(game, query)).sort(query.sort === 'ccu' ? byCcu : byOwners);
  const start = (query.page - 1) * query.pageSize;

  // 각 필터의 개수는 "그 필터만 뺀 나머지 조건"을 적용한 결과 기준이라, 고르면 몇 개가 나오는지 미리 알 수 있다
  const without = (key: keyof Filters) =>
    all.filter((game) => matches(game, { ...query, [key]: key === 'q' ? '' : null }));
  const genreOrder = new Map<string, number>(GENRES.map((g, i) => [g, i]));

  return {
    status: {
      ready: stats.total > 0,
      updatedAt: stats.crawled_at ? new Date(stats.crawled_at).toISOString() : null,
      total: stats.total,
      releaseChecked: stats.checked ?? 0,
    },
    total: filtered.length,
    page: query.page,
    pageSize: query.pageSize,
    games: filtered.slice(start, start + query.pageSize),
    facets: {
      genres: count(without('genre'), (g) => g.genres).sort(
        (a, b) => genreOrder.get(a.value)! - genreOrder.get(b.value)!,
      ),
      years: count(without('year'), (g) => (g.releaseYear === null ? [] : [g.releaseYear])).sort(
        (a, b) => b.value - a.value,
      ),
      platforms: count(without('platform'), (g) => PLATFORMS.filter((p) => g.platforms?.[p])).sort(
        (a, b) => PLATFORMS.indexOf(a.value) - PLATFORMS.indexOf(b.value),
      ),
    },
  };
}
