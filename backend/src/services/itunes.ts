import { ITUNES_MAX_CALLS_PER_MINUTE } from '../config.ts';
import type { IosApp } from '../types.ts';
import { normalizeTitle } from '../utils/text.ts';

const BASE_URL = 'https://itunes.apple.com';
const TIMEOUT_MS = 6_000;
const MAX_SCREENSHOTS = 6;

interface ItunesApp {
  trackId: number;
  trackName: string;
  trackViewUrl?: string;
  primaryGenreName?: string;
  artistName?: string;
  sellerName?: string;
  formattedPrice?: string;
  averageUserRating?: number;
  userRatingCount?: number;
  contentAdvisoryRating?: string;
  languageCodesISO2A?: string[];
  fileSizeBytes?: string;
  description?: string;
  screenshotUrls?: string[];
  releaseDate?: string;
}

export interface IosLookup {
  app: IosApp;
  /** 한국 스토어에 등록된 한국어 소개. 미국 스토어 정보만 있으면 영어 */
  description: string | null;
}

/** 최근 1분 동안 Apple로 보낸 요청 시각 */
const recentCalls: number[] = [];

function takeSlot(): void {
  const now = Date.now();
  while (recentCalls.length > 0 && recentCalls[0]! <= now - 60_000) recentCalls.shift();
  if (recentCalls.length >= ITUNES_MAX_CALLS_PER_MINUTE)
    throw new Error(`iTunes 호출 상한(분당 ${ITUNES_MAX_CALLS_PER_MINUTE}회)에 도달했습니다.`);
  recentCalls.push(now);
}

async function get(path: string, params: Record<string, string>): Promise<ItunesApp[]> {
  takeSlot();
  const res = await fetch(`${BASE_URL}${path}?${new URLSearchParams(params)}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`iTunes HTTP ${res.status}`);
  const data = (await res.json()) as { results?: ItunesApp[] };
  return data.results ?? [];
}

/** 제목에서 부제(" - ", " – ", ": " 뒤)를 뗀 앞부분. App Store 제목은 "게임명 - 부제" 꼴이 많다. */
function mainTitle(title: string): string {
  return title.split(/\s[-–—]\s|:\s/)[0]!;
}

/**
 * 검색 결과에서 같은 게임을 고른다. 제목이 정확히 같은 "게임" 카테고리 앱을 우선 인정하고,
 * 부제만 다른 앱은 제작사·유통사 이름이 RAWG 정보와 겹칠 때만 인정한다.
 * (한국 스토어는 제목이 현지화되어 있어 영어 제목이 나오는 미국 스토어에서 찾는다)
 */
function pickMatch(results: ItunesApp[], name: string, companies: string[]): ItunesApp | null {
  const target = normalizeTitle(name);
  if (!target) return null;
  const games = results.filter((r) => r.primaryGenreName === 'Games');

  const exact = games.find((r) => normalizeTitle(r.trackName) === target);
  if (exact) return exact;

  const wanted = companies.map(normalizeTitle).filter(Boolean);
  return (
    games.find((r) => {
      if (normalizeTitle(mainTitle(r.trackName)) !== target) return false;
      const sellers = [r.artistName, r.sellerName].map((s) => normalizeTitle(s ?? ''));
      return sellers.some((s) => s && wanted.some((c) => s.includes(c) || c.includes(s)));
    }) ?? null
  );
}

/** 링크로 렌더링되므로 apps.apple.com의 https 주소만 허용하고, 추적용 파라미터는 떼어낸다 */
function appStoreUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname === 'apps.apple.com' ? url.origin + url.pathname : null;
  } catch {
    return null;
  }
}

function httpsUrl(raw: string): string | null {
  try {
    return new URL(raw).protocol === 'https:' ? raw : null;
  } catch {
    return null;
  }
}

function toIosApp(app: ItunesApp, storefront: IosApp['storefront']): IosLookup | null {
  const url = appStoreUrl(app.trackViewUrl);
  if (!url) return null;
  const size = Number(app.fileSizeBytes);
  return {
    app: {
      url,
      name: app.trackName,
      price: app.formattedPrice ?? null,
      rating: app.userRatingCount ? Math.round((app.averageUserRating ?? 0) * 10) / 10 : null,
      ratingCount: app.userRatingCount ?? 0,
      seller: app.sellerName ?? app.artistName ?? null,
      ageRating: app.contentAdvisoryRating ?? null,
      koreanSupport: app.languageCodesISO2A?.includes('KO') ?? false,
      sizeMb: Number.isFinite(size) && size > 0 ? Math.round(size / 1_000_000) : null,
      storefront,
      screenshots: (app.screenshotUrls ?? [])
        .map(httpsUrl)
        .filter((s): s is string => s !== null)
        .slice(0, MAX_SCREENSHOTS),
    },
    description: app.description?.trim() || null,
  };
}

/**
 * 게임 이름으로 iOS 앱을 찾아 한국 App Store 정보(가격·평점·소개 등)를 가져온다. Apple 공개 API, 키 불필요.
 * 못 찾으면 null이고, 네트워크·서버 오류는 예외로 던진다 (호출하는 쪽이 캐시 여부를 정한다).
 * 한국 스토어에 없는 앱이면 미국 스토어 정보로 대신한다.
 */
export async function fetchIosApp(name: string, companies: string[]): Promise<IosLookup | null> {
  const found = pickMatch(
    await get('/search', { term: name, country: 'us', entity: 'software', limit: '10' }),
    name,
    companies,
  );
  if (!found) return null;

  const [kr] = await get('/lookup', { id: String(found.trackId), country: 'kr' });
  return kr ? toIosApp(kr, 'KR') : toIosApp(found, 'US');
}

/** App Store 주소에서 앱 번호를 꺼낸다. (예: https://apps.apple.com/us/app/genshin-impact/id1517783697 → 1517783697) */
export function iosAppId(url: string): number | null {
  const match = /^https:\/\/apps\.apple\.com\/.*\/id(\d+)/.exec(url);
  return match ? Number(match[1]) : null;
}

/**
 * 앱 번호로 한국 App Store 정보를 가져온다. RAWG가 App Store 링크를 알고 있는 게임에 쓰며, 이름이 달라도
 * 정확히 찾는다. 한국 스토어에 없으면 미국 스토어 정보로 대신한다.
 */
export async function fetchIosAppById(trackId: number): Promise<IosLookup | null> {
  const [kr] = await get('/lookup', { id: String(trackId), country: 'kr' });
  if (kr) return toIosApp(kr, 'KR');
  const [us] = await get('/lookup', { id: String(trackId), country: 'us' });
  return us ? toIosApp(us, 'US') : null;
}
