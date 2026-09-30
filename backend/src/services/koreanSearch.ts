import type { Game } from '../types.ts';
import { createPromiseCache } from '../utils/cache.ts';
import { searchGameByName, searchGames } from './rawg.ts';

const TIMEOUT_MS = 8_000;
/** 한글 검색어 하나로 RAWG를 부르는 횟수를 제한한다 (RAWG 호출 한도를 아끼기 위해) */
const MAX_STEAM_MATCHES = 4;

export const hasHangul = (text: string): boolean => /[\u3131-\u318e\uac00-\ud7a3]/.test(text);

/** Steam 스토어에서 한국어 이름으로 찾은 앱 번호 (앱만, DLC·번들 제외) */
async function searchSteamKorean(query: string): Promise<number[]> {
  const params = new URLSearchParams({ term: query, l: 'koreana', cc: 'KR' });
  const res = await fetch(`https://store.steampowered.com/api/storesearch/?${params}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: { id: number; type: string }[] };
  return (data.items ?? [])
    .filter((i) => i.type === 'app')
    .map((i) => i.id)
    .slice(0, MAX_STEAM_MATCHES);
}

/** Steam 앱의 영어 이름 */
async function steamEnglishName(appId: number): Promise<string | null> {
  const params = new URLSearchParams({ appids: String(appId), l: 'english', filters: 'basic' });
  const res = await fetch(`https://store.steampowered.com/api/appdetails?${params}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as Record<string, { success: boolean; data?: { name?: string } }>;
  const entry = body[appId];
  return entry?.success && typeof entry.data?.name === 'string' ? entry.data.name : null;
}

const cachedEnglishName = createPromiseCache<number, string | null>({
  ttlMs: 7 * 24 * 60 * 60 * 1000,
  maxEntries: 1000,
  shouldCache: (name) => name !== null,
});

/** 한글 → 영어 번역. 영어 제목의 한글 발음("엘든링")도 원래 제목("Elden Ring")으로 바꿔 준다 */
async function translateToEnglish(text: string): Promise<string | null> {
  const params = new URLSearchParams({ client: 'gtx', sl: 'ko', tl: 'en', dt: 't', q: text });
  const res = await fetch(`https://translate.googleapis.com/translate_a/single?${params}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as [[string | null][]?];
  const translated = (body[0] ?? [])
    .map((part) => part[0] ?? '')
    .join('')
    .trim();
  return translated && translated.toLowerCase() !== text.toLowerCase() ? translated : null;
}

const cachedTranslation = createPromiseCache<string, string | null>({
  ttlMs: 7 * 24 * 60 * 60 * 1000,
  maxEntries: 1000,
  shouldCache: (t) => t !== null,
});

const warn = (what: string, query: string) => (err: unknown) => {
  console.warn(`${what} 실패 (${query}):`, err instanceof Error ? err.message : err);
  return [] as Game[];
};

/** Steam 스토어의 한국어 이름으로 찾은 게임 */
async function viaSteam(query: string): Promise<Game[]> {
  const ids = await searchSteamKorean(query);
  const names = await Promise.all(ids.map((id) => cachedEnglishName(id, () => steamEnglishName(id)).catch(() => null)));
  const found = await Promise.all(
    [...new Set(names.filter((n): n is string => n !== null))].map((n) => searchGameByName(n).catch(() => null)),
  );
  return found.filter((g): g is Game => g !== null);
}

/** 영어로 번역한 검색어로 찾은 게임 */
async function viaTranslation(query: string): Promise<Game[]> {
  const english = await cachedTranslation(query.toLowerCase(), () => translateToEnglish(query));
  return english ? searchGames(english) : [];
}

/**
 * 한글 검색어로 게임을 찾는다. RAWG는 영어 이름만 검색되므로 두 가지 방법을 함께 쓴다:
 * (1) Steam 스토어에서 한국어 이름으로 찾아 그 게임의 영어 이름으로 RAWG 재검색 (한국어 정식 제목),
 * (2) 검색어를 영어로 번역해 RAWG 검색 (영어 제목의 한글 발음). (1)의 결과가 먼저 나오고 중복은 뺀다.
 * 둘 다 결과가 없거나 실패하면 RAWG에 검색어 그대로 검색한다.
 */
export async function searchGamesKorean(query: string): Promise<Game[]> {
  const [steam, translated] = await Promise.all([
    viaSteam(query).catch(warn('Steam 한글 검색', query)),
    viaTranslation(query).catch(warn('번역 검색', query)),
  ]);
  const games = new Map<number, Game>();
  for (const g of [...steam, ...translated]) if (!games.has(g.id)) games.set(g.id, g);
  return games.size > 0 ? [...games.values()] : searchGames(query);
}
