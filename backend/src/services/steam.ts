import type { Metacritic, SteamReviews } from '../types.ts';
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

/**
 * Steam 스토어 페이지에 연결된 메타크리틱 점수 (PC판). 메타크리틱에는 공개 API가 없어 이 값을 쓴다.
 * 퍼블리셔가 Steam 페이지에 점수를 연결한 게임만 있으며, 없다고 평가가 없는 것은 아니다.
 */
export async function fetchSteamMetacritic(appId: number): Promise<Metacritic | null> {
  try {
    const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}&filters=metacritic`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    // 점수가 없으면 data가 빈 배열([])로 온다
    const data = (await res.json()) as Record<
      string,
      { success: boolean; data?: { metacritic?: { score: number; url: string } } }
    >;
    const mc = data[appId]?.data?.metacritic;
    if (!mc || !Number.isFinite(mc.score)) return null;

    // 링크의 추적용 파라미터(?ftag=...)는 떼어낸다
    let url: string | null = null;
    try {
      const parsed = new URL(mc.url);
      if (parsed.protocol === 'https:' && parsed.hostname.endsWith('metacritic.com'))
        url = parsed.origin + parsed.pathname;
    } catch {
      // 링크가 이상하면 점수만 보여준다
    }
    return { score: mc.score, url, platform: 'PC' };
  } catch (err) {
    console.warn(`Steam 메타크리틱 조회 실패 (app ${appId}):`, err instanceof Error ? err.message : err);
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
    };
  } catch (err) {
    console.warn(`Steam 리뷰 조회 실패 (app ${appId}):`, err instanceof Error ? err.message : err);
    return null;
  }
}
