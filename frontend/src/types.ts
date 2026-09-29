/** 백엔드가 내려주는 게임 정보. backend/src/types.ts와 동일하게 유지할 것. */
export interface Game {
  id: number;
  name: string;
  /** 출시일, YYYY-MM-DD */
  released: string;
  image: string | null;
  rating: number;
  metacritic: number | null;
  platforms: string[];
  genres: string[];
  /** 상세 정보 페이지 링크 (샘플 데이터는 null) */
  url: string | null;
}

export interface User {
  id: number;
  email: string;
  nickname: string;
  /** 가입 시각 (ISO 8601) */
  createdAt: string;
}

export interface StoreLink {
  slug: string;
  name: string;
  url: string;
}

/** Steam 사용자 평가 요약 */
export interface SteamReviews {
  appId: number;
  /** "매우 긍정적" 등. 리뷰가 적어 Steam이 등급을 매기지 않았으면 null */
  label: string | null;
  /** Steam 등급 점수 (1: 압도적으로 부정적 ~ 9: 압도적으로 긍정적, 0: 등급 없음) */
  score: number;
  /** 긍정 비율(%). 리뷰가 없으면 null */
  percent: number | null;
  total: number;
  url: string;
}

/** 메타크리틱 평론가 점수 (메타스코어) */
export interface Metacritic {
  score: number;
  /** 메타크리틱 게임 페이지 */
  url: string | null;
  /** 점수의 기준 플랫폼. 메타크리틱은 플랫폼마다 점수가 따로 있다. */
  platform: string | null;
}

/** GET /api/games/:id/store-info 응답. backend/src/types.ts와 동일하게 유지할 것. */
export interface StoreInfo {
  stores: StoreLink[];
  /** Steam에서 팔지 않는 게임이면 null */
  steam: SteamReviews | null;
  /** Steam 페이지에 연결된 메타스코어(PC판). 없으면 null */
  metacritic: Metacritic | null;
}

export interface ReleasesResponse {
  games: Game[];
  /** true면 백엔드에 API 키가 없어 샘플 데이터로 응답한 것 */
  sample: boolean;
  /** true면 일부 페이지를 가져오지 못해 목록이 완전하지 않다 */
  partial?: boolean;
}
