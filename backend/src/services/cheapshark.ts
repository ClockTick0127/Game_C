import type { PriceDeal, Prices } from '../types.ts';
import { createPromiseCache } from '../utils/cache.ts';

const BASE_URL = 'https://www.cheapshark.com/api/1.0';
const TIMEOUT_MS = 6_000;
/** CheapShark는 앱을 식별할 수 있는 User-Agent가 없으면 요청을 거절한다 */
const HEADERS = { 'User-Agent': 'GameCalendar/1.0 (game release calendar; personal project)' };
const MAX_DEALS = 4;

interface CheapSharkStore {
  storeID: string;
  storeName: string;
  isActive: number;
}

interface CheapSharkGame {
  cheapestPriceEver?: { price: string; date: number };
  deals?: { storeID: string; dealID: string; price: string; retailPrice: string; savings: string }[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`CheapShark HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** 스토어 목록은 거의 바뀌지 않으므로 하루 동안 기억한다 */
const cachedStores = createPromiseCache<'all', Map<string, string>>({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 1 });

function loadStoreNames(): Promise<Map<string, string>> {
  return cachedStores('all', async () => {
    const stores = await get<CheapSharkStore[]>('/stores');
    return new Map(stores.filter((s) => s.isActive === 1).map((s) => [s.storeID, s.storeName]));
  });
}

/** 응답의 dealID는 이미 URL 인코딩되어 있어, 한 번 풀었다가 파라미터로 다시 인코딩한다 */
function dealUrl(dealId: string): string {
  let id = dealId;
  try {
    id = decodeURIComponent(dealId);
  } catch {
    // 이상한 값이면 그대로 쓴다
  }
  return `https://www.cheapshark.com/redirect?${new URLSearchParams({ dealID: id })}`;
}

function toDate(unixSeconds: number): string | null {
  const date = new Date(unixSeconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/**
 * Steam 앱 번호로 PC 스토어별 현재 가격(USD)과 역대 최저가를 가져온다. CheapShark 공개 API, 키 불필요.
 * 정보가 없는 게임은 null이고, 네트워크·서버 오류는 예외로 던진다 (호출하는 쪽이 캐시 여부를 정한다).
 */
export async function fetchPrices(steamAppId: number): Promise<Prices | null> {
  const [found, storeNames] = await Promise.all([
    get<{ gameID: string }[]>(`/games?${new URLSearchParams({ steamAppID: String(steamAppId) })}`),
    loadStoreNames(),
  ]);
  const gameId = found[0]?.gameID;
  if (!gameId) return null;

  const game = await get<CheapSharkGame>(`/games?${new URLSearchParams({ id: gameId })}`);

  const deals: PriceDeal[] = [];
  for (const d of game.deals ?? []) {
    const store = storeNames.get(d.storeID);
    const price = Number(d.price);
    const retailPrice = Number(d.retailPrice);
    if (!store || !Number.isFinite(price) || !Number.isFinite(retailPrice)) continue;
    deals.push({
      store,
      price,
      retailPrice,
      savingsPercent: Math.round(Number(d.savings)) || 0,
      url: dealUrl(d.dealID),
    });
  }
  deals.sort((a, b) => a.price - b.price);

  const ever = game.cheapestPriceEver;
  const everPrice = ever ? Number(ever.price) : NaN;
  const cheapestEver = Number.isFinite(everPrice) ? { price: everPrice, date: ever ? toDate(ever.date) : null } : null;

  if (deals.length === 0 && !cheapestEver) return null;
  return { deals: deals.slice(0, MAX_DEALS), cheapestEver };
}
