import type { StoreInfo, StoreLink } from '../types.ts';
import { createPromiseCache } from '../utils/cache.ts';
import { HttpError } from '../utils/http.ts';
import { fetchGameBasics, fetchStoreLinks, RawgApiError } from './rawg.ts';
import { IS_SAMPLE_MODE } from './releases.ts';
import { fetchSteamMetacritic, fetchSteamReviews, searchSteamAppId, steamAppId } from './steam.ts';

/** RAWG 스토어 번호 → 표시 정보. 목록 순서가 버튼 순서다. (RAWG /api/stores 기준, 거의 바뀌지 않는다) */
const STORES: { id: number; slug: string; name: string }[] = [
  { id: 1, slug: 'steam', name: 'Steam' },
  { id: 11, slug: 'epic-games', name: 'Epic Games' },
  { id: 5, slug: 'gog', name: 'GOG' },
  { id: 3, slug: 'playstation-store', name: 'PlayStation Store' },
  { id: 2, slug: 'xbox-store', name: 'Xbox Store' },
  { id: 6, slug: 'nintendo', name: 'Nintendo eShop' },
  { id: 4, slug: 'apple-appstore', name: 'App Store' },
  { id: 8, slug: 'google-play', name: 'Google Play' },
  { id: 9, slug: 'itch', name: 'itch.io' },
  { id: 7, slug: 'xbox360', name: 'Xbox 360 Store' },
];

/** 링크로 렌더링되므로 http(s)만 허용하고, http는 https로 올린다. (RAWG의 GOG 링크 등은 http로 온다) */
function safeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:') parsed.protocol = 'https:';
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

async function loadStoreInfo(gameId: number): Promise<StoreInfo> {
  const links = await fetchStoreLinks(gameId);

  const stores: StoreLink[] = [];
  for (const store of STORES) {
    // 같은 스토어의 지역별 링크가 여러 개일 수 있어 첫 번째만 쓴다
    const link = links.find((l) => l.storeId === store.id);
    const url = link && safeUrl(link.url);
    if (url) stores.push({ slug: store.slug, name: store.name, url });
  }

  const steamUrl = stores.find((s) => s.slug === 'steam')?.url;
  let appId = steamUrl ? steamAppId(steamUrl) : null;

  // RAWG에 Steam 링크가 없어도 PC 게임이면 Steam에 있을 수 있다 (신작은 RAWG 스토어 정보가 늦게 채워진다)
  if (!appId) {
    const basics = await fetchGameBasics(gameId);
    appId = basics.platforms.includes('pc') ? await searchSteamAppId(basics.name) : null;
    if (appId) stores.unshift({ slug: 'steam', name: 'Steam', url: `https://store.steampowered.com/app/${appId}/` });
  }

  if (!appId) return { stores, steam: null, metacritic: null };
  const [steam, metacritic] = await Promise.all([fetchSteamReviews(appId), fetchSteamMetacritic(appId)]);
  return { stores, steam, metacritic };
}

/** 평가는 자주 바뀌지 않으므로 6시간 캐시 */
const cachedStoreInfo = createPromiseCache<number, StoreInfo>({ ttlMs: 6 * 60 * 60 * 1000, maxEntries: 1000 });

/**
 * RAWG에 없는 게임 번호. 실패는 캐시하지 않으므로, 없는 번호를 반복해서 조회하면 매번 RAWG를 부르게 된다.
 * 그래서 없다고 확인된 번호는 별도 목록에 잠시 기억한다. (정상 캐시와 섞으면 없는 번호를 대량으로 조회해 캐시를 밀어낼 수 있다)
 */
const MISSING_TTL_MS = 10 * 60 * 1000;
const MAX_MISSING = 500;
const missing = new Map<number, number>(); // 게임 번호 → 기억을 그만둘 시각

function isKnownMissing(gameId: number): boolean {
  const until = missing.get(gameId);
  if (until === undefined) return false;
  if (until <= Date.now()) {
    missing.delete(gameId);
    return false;
  }
  return true;
}

function rememberMissing(gameId: number): void {
  if (missing.size >= MAX_MISSING) missing.delete(missing.keys().next().value!);
  missing.set(gameId, Date.now() + MISSING_TTL_MS);
}

const NOT_FOUND = '게임을 찾을 수 없습니다.';

export async function getStoreInfo(gameId: number): Promise<StoreInfo> {
  // 샘플 게임은 RAWG에 없는 가상의 게임이다
  if (IS_SAMPLE_MODE) return { stores: [], steam: null, metacritic: null };
  if (isKnownMissing(gameId)) throw new HttpError(404, NOT_FOUND);

  try {
    return await cachedStoreInfo(gameId, () => loadStoreInfo(gameId));
  } catch (err) {
    if (err instanceof RawgApiError && err.status === 404) rememberMissing(gameId);
    throw err;
  }
}
