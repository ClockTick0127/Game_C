import type { PopularPlatform } from '../types';

export const GENRE_LABELS: Record<string, string> = {
  Action: '액션',
  Adventure: '어드벤처',
  Casual: '캐주얼',
  Indie: '인디',
  'Massively Multiplayer': '대규모 멀티플레이어',
  Racing: '레이싱',
  RPG: 'RPG',
  Simulation: '시뮬레이션',
  Sports: '스포츠',
  Strategy: '전략',
  'Free To Play': '무료',
};

export const PLATFORM_LABELS: Record<PopularPlatform, string> = {
  windows: 'Windows',
  mac: 'macOS',
  linux: 'Linux',
};

export const genreLabel = (genre: string) => GENRE_LABELS[genre] ?? genre;

/** 1,000,000 → "100만", 200,000,000 → "2억" */
export function formatCount(n: number): string {
  if (n >= 100_000_000) return `${+(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${(n / 10_000).toLocaleString('ko-KR')}만`;
  return n.toLocaleString('ko-KR');
}

/** 보유자 수 추정 구간: "100만 ~ 200만" */
export function formatOwners(min: number, max: number): string {
  return `${formatCount(min)} ~ ${formatCount(max)}`;
}

/**
 * 가격 표시. 무료는 "무료", 정보가 없으면 null.
 * 환율이 있으면 원화(10원 단위 반올림), 없으면 달러로 보여 준다.
 */
export function formatPrice(priceUsd: number | null, krwPerUsd: number | null = null): string | null {
  if (priceUsd === null) return null;
  if (priceUsd === 0) return '무료';
  if (krwPerUsd === null) return `$${priceUsd.toFixed(2)}`;
  return `₩${(Math.round((priceUsd * krwPerUsd) / 10) * 10).toLocaleString('ko-KR')}`;
}
