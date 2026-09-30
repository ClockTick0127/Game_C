import type { GameDetails, IosApp, RelatedGames, StoreInfo, StoreLink } from '../types.ts';
import { createPromiseCache } from '../utils/cache.ts';
import { HttpError } from '../utils/http.ts';
import { fetchIosApp, fetchIosAppById, iosAppId, type IosLookup } from './itunes.ts';
import { fetchGameInfo, fetchRelatedGames, fetchStoreLinks, RawgApiError, type RawgGameInfo } from './rawg.ts';
import { IS_SAMPLE_MODE } from './releases.ts';
import { toKorean } from './translate.ts';
import {
  fetchSteamAppDetails,
  fetchSteamCurrentPlayers,
  fetchSteamReviews,
  searchSteamAppId,
  steamAppId,
  type SteamAppDetails,
} from './steam.ts';

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

/** 부가 정보를 가져온다. 실패해도 스토어 링크와 평가는 보여줘야 하므로 예외 대신 ok: false로 알린다. */
async function attempt<T>(label: string, load: () => Promise<T>): Promise<{ value: T | null; ok: boolean }> {
  try {
    return { value: await load(), ok: true };
  } catch (err) {
    console.warn(`${label} 조회 실패:`, err instanceof HttpError ? (err.detail ?? err.message) : err);
    return { value: null, ok: false };
  }
}

const MAX_DESCRIPTION = 500;

function truncate(text: string): string {
  return text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION).trimEnd()}…` : text;
}

/** RAWG·Steam·App Store 정보를 합친다. 소개는 한국어인 Steam, App Store를 RAWG(영어)보다 우선한다. */
function mergeDetails(
  rawg: RawgGameInfo | null,
  steam: SteamAppDetails | null,
  ios: IosLookup | null,
): GameDetails | null {
  if (!rawg && !steam && !ios) return null;
  const description = steam?.description ?? ios?.description ?? rawg?.description ?? null;
  return {
    description: description && truncate(description),
    developers: steam?.developers.length ? steam.developers : (rawg?.developers ?? []),
    publishers: steam?.publishers.length ? steam.publishers : (rawg?.publishers ?? []),
    tags: rawg?.tags ?? [],
    ageRating: rawg?.ageRating ?? null,
    playtimeHours: rawg?.playtimeHours ?? null,
    website: steam?.website ?? rawg?.website ?? null,
    steam: steam?.store ?? null,
  };
}

/** complete가 false면 부가 정보(RAWG 소개·DLC, 가격)를 가져오지 못한 것이므로 캐시하지 않는다 (다음 요청에서 다시 시도) */
interface Loaded {
  info: StoreInfo;
  complete: boolean;
}

/** RAWG 소개는 영어라서 한국어로 번역해 내려 준다 (Steam·App Store 소개는 이미 한국어라 그대로 둔다) */
async function translateDescription(info: StoreInfo): Promise<StoreInfo> {
  const details = info.details;
  if (!details?.description) return info;
  return { ...info, details: { ...details, description: await toKorean(details.description) } };
}

async function loadStoreInfo(gameId: number): Promise<Loaded> {
  const loaded = await loadUntranslated(gameId);
  return { ...loaded, info: await translateDescription(loaded.info) };
}

async function loadUntranslated(gameId: number): Promise<Loaded> {
  const [links, rawgResult, relatedResult] = await Promise.all([
    fetchStoreLinks(gameId),
    attempt(`RAWG 게임 정보 (game ${gameId})`, () => fetchGameInfo(gameId)),
    attempt(`RAWG DLC·시리즈 (game ${gameId})`, () => fetchRelatedGames(gameId)),
  ]);
  const rawg: RawgGameInfo | null = rawgResult.value;
  const related: RelatedGames | null = relatedResult.value;

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
  if (!appId && rawg?.platforms.includes('pc')) {
    appId = await searchSteamAppId(rawg.name);
    if (appId) stores.unshift({ slug: 'steam', name: 'Steam', url: `https://store.steampowered.com/app/${appId}/` });
  }

  // RAWG가 App Store 링크를 알고 있으면 그 앱 번호로 정확히 찾고, 없으면 iOS 게임으로 확인된 경우에만 이름으로 찾는다.
  // (이름이 비슷한 다른 앱을 잘못 붙이지 않기 위해서다)
  const appleUrl = stores.find((s) => s.slug === 'apple-appstore')?.url;
  const iosId = appleUrl ? iosAppId(appleUrl) : null;
  const iosResult = iosId
    ? await attempt(`iTunes 조회 (game ${gameId})`, () => fetchIosAppById(iosId))
    : rawg?.platforms.includes('ios')
      ? await attempt(`iTunes 검색 (game ${gameId})`, () =>
          fetchIosApp(rawg.name, [...rawg.developers, ...rawg.publishers]),
        )
      : { value: null, ok: true };
  const ios: IosLookup | null = iosResult.value;
  if (ios && !stores.some((s) => s.slug === 'apple-appstore'))
    stores.push({ slug: 'apple-appstore', name: 'App Store', url: ios.app.url });
  const iosApp: IosApp | null = ios?.app ?? null;

  if (!appId) {
    return {
      info: {
        stores,
        steam: null,
        metacritic: null,
        details: mergeDetails(rawg, null, ios),
        related,
        ios: iosApp,
      },
      complete: rawgResult.ok && relatedResult.ok && iosResult.ok,
    };
  }

  const [steam, steamStore] = await Promise.all([fetchSteamReviews(appId), fetchSteamAppDetails(appId)]);
  return {
    info: {
      stores,
      steam,
      metacritic: steamStore?.metacritic ?? null,
      details: mergeDetails(rawg, steamStore, ios),
      related,
      ios: iosApp,
    },
    complete: rawgResult.ok && relatedResult.ok && iosResult.ok,
  };
}

/** 평가는 자주 바뀌지 않으므로 6시간 캐시 */
const cachedStoreInfo = createPromiseCache<number, Loaded>({
  ttlMs: 6 * 60 * 60 * 1000,
  maxEntries: 1000,
  shouldCache: (loaded) => loaded.complete,
});

/** 접속자 수는 금방 변하므로 나머지 정보(6시간)와 따로 5분만 기억한다. 못 가져온 결과(null)는 남기지 않는다. */
const cachedPlayers = createPromiseCache<number, number | null>({
  ttlMs: 5 * 60 * 1000,
  maxEntries: 1000,
  shouldCache: (count) => count !== null,
});

async function withCurrentPlayers(info: StoreInfo): Promise<StoreInfo> {
  if (!info.steam) return info;
  const appId = info.steam.appId;
  const currentPlayers = await cachedPlayers(appId, () => fetchSteamCurrentPlayers(appId));
  return { ...info, steam: { ...info.steam, currentPlayers } };
}

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
  if (IS_SAMPLE_MODE) return { stores: [], steam: null, metacritic: null, details: null, related: null, ios: null };
  if (isKnownMissing(gameId)) throw new HttpError(404, NOT_FOUND);

  try {
    const { info } = await cachedStoreInfo(gameId, () => loadStoreInfo(gameId));
    return await withCurrentPlayers(info);
  } catch (err) {
    if (err instanceof RawgApiError && err.status === 404) rememberMissing(gameId);
    throw err;
  }
}
