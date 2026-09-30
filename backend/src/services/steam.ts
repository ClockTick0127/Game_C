import type { Metacritic, SteamReviews, SteamStore } from '../types.ts';
import { normalizeTitle } from '../utils/text.ts';

const TIMEOUT_MS = 8_000;

/** Steam 스토어 페이지와 같은 한국어 표기 */
const LABELS: Record<string, string> = {
  'Overwhelmingly Positive': '압도적으로 긍정적',
  'Very Positive': '매우 긍정적',
  Positive: '긍정적',
  'Mostly Positive': '대체로 긍정적',
  Mixed: '복합적',
  'Mostly Negative': '대체로 부정적',
  Negative: '부정적',
  'Very Negative': '매우 부정적',
  'Overwhelmingly Negative': '압도적으로 부정적',
};

interface AppReviewsResponse {
  success: number;
  query_summary?: {
    review_score: number;
    review_score_desc: string;
    total_positive: number;
    total_negative: number;
    total_reviews: number;
  };
}

/** Steam 스토어 URL에서 앱 번호를 꺼낸다. (예: https://store.steampowered.com/app/892970/ → 892970) */
export function steamAppId(url: string): number | null {
  const match = /store\.steampowered\.com\/app\/(\d+)/.exec(url);
  return match ? Number(match[1]) : null;
}

/**
 * 이름으로 Steam 앱 번호를 찾는다. RAWG에 스토어 링크가 아직 없는 신작(출시 직전·직후)을 위한 보조 수단.
 * 검색 결과에는 DLC·사운드트랙·데모도 섞여 오므로 이름이 정확히 같은 것만 인정한다.
 */
export async function searchSteamAppId(name: string): Promise<number | null> {
  const target = normalizeTitle(name);
  if (!target) return null;
  try {
    const params = new URLSearchParams({ term: name, l: 'english', cc: 'US' });
    const res = await fetch(`https://store.steampowered.com/api/storesearch/?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: { id: number; name: string; type: string }[] };
    const match = data.items?.find((item) => item.type === 'app' && normalizeTitle(item.name) === target);
    return match?.id ?? null;
  } catch (err) {
    console.warn(`Steam 검색 실패 (${name}):`, err instanceof Error ? err.message : err);
    return null;
  }
}

interface AppDetailsData {
  metacritic?: { score: number; url: string };
  is_free?: boolean;
  price_overview?: { initial_formatted?: string; final_formatted?: string; discount_percent?: number };
  categories?: { description: string }[];
  supported_languages?: string;
  release_date?: { coming_soon?: boolean; date?: string };
  screenshots?: { path_thumbnail?: string; path_full: string }[];
  short_description?: string;
  developers?: string[];
  publishers?: string[];
  website?: string | null;
}

export interface SteamAppDetails {
  /** Steam 페이지에 연결된 메타스코어(PC판). 메타크리틱에는 공개 API가 없어 이 값을 쓴다. 없다고 평가가 없는 것은 아니다. */
  metacritic: Metacritic | null;
  store: SteamStore;
  /** Steam이 한국어로 적어 둔 짧은 소개 */
  description: string | null;
  developers: string[];
  publishers: string[];
  website: string | null;
}

const MAX_SCREENSHOTS = 6;

/** 링크로 렌더링되므로 https만 허용한다 */
function httpsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/** "한국어<strong>*</strong>, English, 日本語" 형태에서 언어 이름만 꺼낸다 (*는 음성 지원 표시) */
function parseLanguages(html: string | undefined): string[] {
  if (!html) return [];
  const withoutNote = html.split(/<br\s*\/?>/i)[0]!;
  return withoutNote
    .split(',')
    .map((name) => stripTags(name).replace(/\*/g, '').trim())
    .filter(Boolean);
}

/** 메타크리틱 링크의 추적용 파라미터(?ftag=...)는 떼어내고, 메타크리틱 주소가 아니면 버린다 */
function cleanMetacriticUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('metacritic.com')
      ? parsed.origin + parsed.pathname
      : null;
  } catch {
    return null;
  }
}

/**
 * Steam 스토어 페이지 정보(한국 스토어·한국어 기준): 메타스코어, 가격, 지원 언어, 분류, 스크린샷, 소개, 제작사.
 * 부가 정보이므로 실패하거나 페이지가 없으면 null을 돌려준다.
 */
export async function fetchSteamAppDetails(appId: number): Promise<SteamAppDetails | null> {
  try {
    const params = new URLSearchParams({ appids: String(appId), cc: 'kr', l: 'koreana' });
    const res = await fetch(`https://store.steampowered.com/api/appdetails?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    // 페이지가 없으면 success가 false이고, 항목이 비면 data가 빈 배열([])로 온다
    const body = (await res.json()) as Record<string, { success: boolean; data?: AppDetailsData }>;
    const entry = body[appId];
    if (!entry?.success || !entry.data || Array.isArray(entry.data)) return null;
    const d = entry.data;

    const mc = d.metacritic;
    const languages = parseLanguages(d.supported_languages);
    const price = d.price_overview;
    return {
      metacritic:
        mc && Number.isFinite(mc.score) ? { score: mc.score, url: cleanMetacriticUrl(mc.url), platform: 'PC' } : null,
      store: {
        price: d.is_free
          ? { free: true, final: null, initial: null, discountPercent: 0 }
          : price?.final_formatted
            ? {
                free: false,
                final: price.final_formatted,
                initial: price.initial_formatted || null,
                discountPercent: price.discount_percent ?? 0,
              }
            : null,
        // 같은 분류가 두 번 오는 경우가 있다 (예: 컨트롤러 지원)
        categories: [...new Set((d.categories ?? []).map((c) => c.description).filter(Boolean))],
        languages,
        koreanSupport: languages.includes('한국어'),
        releaseText: d.release_date?.date || null,
        screenshots: (d.screenshots ?? [])
          .map((sh) => {
            const full = httpsUrl(sh.path_full);
            return full === null ? null : { thumbnail: httpsUrl(sh.path_thumbnail) ?? full, full };
          })
          .filter((sh): sh is SteamStore['screenshots'][number] => sh !== null)
          .slice(0, MAX_SCREENSHOTS),
      },
      description: d.short_description ? stripTags(d.short_description) || null : null,
      developers: d.developers ?? [],
      publishers: d.publishers ?? [],
      website: httpsUrl(d.website),
    };
  } catch (err) {
    console.warn(`Steam 스토어 정보 조회 실패 (app ${appId}):`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Steam 사용자 평가 요약. Valve가 공개한 리뷰 API를 쓰며 API 키가 필요 없다.
 * (https://partner.steamgames.com/doc/store/getreviews)
 * 평가는 부가 정보이므로 실패해도 에러 대신 null을 돌려준다.
 */
export async function fetchSteamReviews(appId: number): Promise<SteamReviews | null> {
  const params = new URLSearchParams({ json: '1', language: 'all', purchase_type: 'all', num_per_page: '0' });
  try {
    const res = await fetch(`https://store.steampowered.com/appreviews/${appId}?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as AppReviewsResponse;
    const summary = data.query_summary;
    if (data.success !== 1 || !summary) return null;

    return {
      appId,
      // 리뷰가 10개 미만이면 Steam도 등급을 매기지 않는다 ("3 user reviews" 같은 문구가 온다)
      label: LABELS[summary.review_score_desc] ?? null,
      score: summary.review_score,
      percent: summary.total_reviews > 0 ? Math.round((summary.total_positive / summary.total_reviews) * 100) : null,
      total: summary.total_reviews,
      url: `https://store.steampowered.com/app/${appId}/#app_reviews_hash`,
      // 접속자 수는 자주 바뀌어 리뷰와 따로 캐시한다 (storeInfo.ts). 여기서는 자리만 채운다.
      currentPlayers: null,
    };
  } catch (err) {
    console.warn(`Steam 리뷰 조회 실패 (app ${appId}):`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** 지금 Steam에서 이 게임을 플레이 중인 사람 수. Valve 공개 API라 키가 필요 없다. 실패하면 null */
export async function fetchSteamCurrentPlayers(appId: number): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: { player_count?: number; result?: number } };
    const count = data.response?.player_count;
    // result가 1이 아니면 앱을 찾지 못한 것이다 (출시 전 게임 등)
    return data.response?.result === 1 && Number.isInteger(count) ? count! : null;
  } catch (err) {
    console.warn(`Steam 접속자 수 조회 실패 (app ${appId}):`, err instanceof Error ? err.message : err);
    return null;
  }
}
