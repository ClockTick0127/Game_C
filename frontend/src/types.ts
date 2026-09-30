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
  /** 지금 Steam에서 플레이 중인 사람 수. 조회하지 못했으면 null */
  currentPlayers: number | null;
}

/** 메타크리틱 평론가 점수 (메타스코어) */
export interface Metacritic {
  score: number;
  /** 메타크리틱 게임 페이지 */
  url: string | null;
  /** 점수의 기준 플랫폼. 메타크리틱은 플랫폼마다 점수가 따로 있다. */
  platform: string | null;
}

/** Steam 스토어 페이지에서 가져온 정보 (한국 스토어 기준) */
export interface SteamStore {
  /** 가격. 무료면 free: true, 출시 전 등으로 가격이 없으면 null */
  price: { free: boolean; final: string | null; initial: string | null; discountPercent: number } | null;
  /** "싱글 플레이어", "Steam 도전 과제" 같은 스토어 분류 (한국어) */
  categories: string[];
  /** 지원 언어 이름 (한국어 표기) */
  languages: string[];
  koreanSupport: boolean;
  /** Steam이 표시하는 출시일 문구. 출시 전이면 "2026년 4분기" 같은 문구일 수 있다 */
  releaseText: string | null;
  /** 목록에는 thumbnail, 클릭하면 full을 연다 */
  screenshots: { thumbnail: string; full: string }[];
}

/** 게임 소개와 제작 정보. RAWG와 Steam을 합친 것이며 못 가져온 항목은 비어 있다. */
export interface GameDetails {
  /** 한국어 소개(Steam)를 우선하고, 없으면 RAWG 설명 */
  description: string | null;
  developers: string[];
  publishers: string[];
  /** RAWG 태그 (영어) */
  tags: string[];
  /** ESRB 등급 이름 */
  ageRating: string | null;
  /** 평균 플레이 시간(시간). 데이터가 없으면 null */
  playtimeHours: number | null;
  website: string | null;
  steam: SteamStore | null;
}

/** 스토어별 가격 한 건 (CheapShark, USD) */
export interface PriceDeal {
  store: string;
  price: number;
  retailPrice: number;
  /** 정가 대비 할인율(%) */
  savingsPercent: number;
  /** 해당 스토어의 구매 페이지로 이동하는 링크 */
  url: string;
}

/** PC 게임 스토어별 가격 비교. 가격은 모두 USD다. */
export interface Prices {
  /** 싼 순서. 최대 몇 개만 담는다 */
  deals: PriceDeal[];
  /** 역대 최저가. 날짜는 YYYY-MM-DD */
  cheapestEver: { price: number; date: string | null } | null;
}

/** DLC·시리즈 목록에 나오는 게임 한 건 */
export interface RelatedGame {
  id: number;
  name: string;
  /** YYYY-MM-DD. 출시일 미정이면 null */
  released: string | null;
}

export interface RelatedGames {
  /** DLC·확장팩·에디션 */
  additions: RelatedGame[];
  /** 같은 시리즈의 다른 게임 */
  series: RelatedGame[];
}

/** iOS App Store 정보 (Apple 공개 API) */
export interface IosApp {
  /** App Store 페이지 */
  url: string;
  name: string;
  /** "무료", "₩1,200" 같은 표시용 가격 */
  price: string | null;
  /** 평균 별점(0~5). 평가가 없으면 null */
  rating: number | null;
  ratingCount: number;
  seller: string | null;
  /** "12+" 같은 연령 등급 */
  ageRating: string | null;
  koreanSupport: boolean;
  sizeMb: number | null;
  /** 한국 스토어에 없는 앱은 미국 스토어 정보로 대신한다 */
  storefront: 'KR' | 'US';
  screenshots: string[];
}

/** GET /api/games/:id/store-info 응답. backend/src/types.ts와 동일하게 유지할 것. */
export interface StoreInfo {
  stores: StoreLink[];
  /** Steam에서 팔지 않는 게임이면 null */
  steam: SteamReviews | null;
  /** Steam 페이지에 연결된 메타스코어(PC판). 없으면 null */
  metacritic: Metacritic | null;
  /** 소개와 제작 정보. 가져오지 못했으면 null */
  details: GameDetails | null;
  /** PC 스토어별 가격 비교. Steam에서 팔지 않거나 가져오지 못했으면 null */
  prices: Prices | null;
  /** DLC와 같은 시리즈 게임. 가져오지 못했으면 null */
  related: RelatedGames | null;
  /** iOS 게임이면 App Store 정보. 없거나 찾지 못했으면 null */
  ios: IosApp | null;
}

export interface ReleasesResponse {
  games: Game[];
  /** true면 백엔드에 API 키가 없어 샘플 데이터로 응답한 것 */
  sample: boolean;
  /** true면 일부 페이지를 가져오지 못해 목록이 완전하지 않다 */
  partial?: boolean;
}
