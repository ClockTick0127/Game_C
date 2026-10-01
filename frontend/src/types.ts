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
  /** 연동한 Steam 계정(SteamID64). 연동하지 않았으면 null */
  steamId: string | null;
  /** 선호 플랫폼·장르. 캘린더를 열 때 기본 필터로 적용된다. 정하지 않았으면 null */
  preferredPlatform: string | null;
  preferredGenre: string | null;
  /** true면 누구나 /u/닉네임 에서 내 진열장을 볼 수 있다 */
  profilePublic: boolean;
}

/** 공개 진열장에 전시된 게임 한 개. 메모 같은 개인 정보는 오지 않는다 (backend/src/services/showcase.ts와 같다) */
export interface ShowcaseGame {
  /** 서재 번호: Steam 앱 번호, 직접 추가한 게임은 RAWG 번호 + 10억 */
  appId: number;
  name: string;
  playtimeMinutes: number;
  custom: boolean;
  image: string | null;
  steamAppId: number | null;
  status: GameStatus | null;
  rating: number | null;
}

/** GET /api/profiles/:nickname/showcase 응답 */
export interface Showcase {
  nickname: string;
  /** 진열장에 꽂은 순서대로 */
  games: ShowcaseGame[];
}

/** 마이페이지의 Steam 연동 상태 */
export interface SteamStatus {
  /** false면 서버에 Steam API 키가 없어 보유 게임·업적은 조회할 수 없다 */
  configured: boolean;
  profile: { name: string; avatar: string | null; url: string | null } | null;
}

export interface SteamOwnedGame {
  appId: number;
  name: string;
  playtimeMinutes: number;
  /** 최근 2주 동안 플레이한 시간(분). 없으면 0 */
  recentMinutes?: number;
  lastPlayedAt: string | null;
  image: string;
  /** 정사각형 공식 게임 아이콘. 없는 게임은 null */
  iconUrl: string | null;
  /** 게임의 분위기(책등 제목 폰트를 고른다). 서버가 아직 알아내지 못했으면 null */
  persona: Persona | null;
  /** 직접 추가한 게임(Steam 보유 게임이 아님)이면 true. 플레이 시간·업적이 없다 */
  custom?: boolean;
  /** 직접 추가한 게임의 표지 이미지 */
  coverUrl?: string | null;
  /** 직접 추가한 게임 중 Steam에도 있는 게임의 Steam 앱 번호 */
  steamAppId?: number | null;
}

/** 내 서재에 직접 추가한 게임 (RAWG 검색 결과에서 고른 것) */
export interface CustomGame {
  /** RAWG 게임 번호 */
  id: number;
  name: string;
  image: string | null;
  /** Steam에도 있는 게임이면 그 앱 번호. 공식 표지를 쓰는 데 쓴다 */
  steamAppId?: number | null;
}

/** 하는 중 · 클리어 · 쌓아둠 · 포기 */
export type GameStatus = 'playing' | 'cleared' | 'backlog' | 'dropped';

/** 사용자가 채운 내용. 채우지 않은 칸은 status·rating이 null, note가 빈 문자열이다 */
export interface GameLogInput {
  status: GameStatus | null;
  /** 1~5 */
  rating: number | null;
  /** 최대 200자 */
  note: string;
}

/** 게임별 플레이 상태·별점·메모. gameId는 서재 번호(SteamOwnedGame.appId). backend/src/services/gameLog.ts와 동일하게 유지할 것 */
export interface GameLog extends GameLogInput {
  gameId: number;
}

export type Persona = 'horror' | 'scifi' | 'fantasy' | 'retro' | 'cute' | 'sports' | 'strategy' | 'action' | 'default';

/** Steam 위시리스트의 게임 한 건. backend/src/services/steamWishlist.ts와 동일하게 유지할 것 */
export interface SteamWishlistItem {
  appId: number;
  name: string;
  /** Steam이 알려 준 출시일 (YYYY-MM-DD). 미정이면 null */
  released: string | null;
  image: string;
  /** 이미 관심 게임에 있는 게임 */
  favorite: boolean;
}

export interface SteamWishlist {
  /** 위시리스트 순서. 비어 있으면 위시리스트가 비었거나 비공개인 것이다 (Steam은 둘을 구분해 주지 않는다) */
  items: SteamWishlistItem[];
  /** DLC·데모처럼 게임이 아니어서 뺀 항목 수 */
  excluded: number;
}

export interface SteamWishlistImportResult {
  appId: number;
  /**
   * added: 추가함 · exists: 이미 관심 게임 · notFound: 같은 이름의 게임을 찾지 못함 · noDate: 출시일 미정이라 넣을 수 없음 ·
   * error: RAWG 조회 실패(나중에 다시 시도하면 된다)
   */
  status: 'added' | 'exists' | 'notFound' | 'noDate' | 'error';
  game: Game | null;
  /** error일 때의 사유 */
  message?: string;
}

export interface SteamOwnedGames {
  /** true면 프로필의 게임 세부 정보가 비공개라 목록을 볼 수 없다 */
  private: boolean;
  games: SteamOwnedGame[];
  /** 분위기를 아직 알아내지 못한 게임 수. 0보다 크면 서버가 백그라운드에서 알아내는 중이다 */
  stylesPending?: number;
}

export interface SteamAchievement {
  id: string;
  name: string;
  description: string;
  achieved: boolean;
  unlockedAt: string | null;
}

export interface SteamAchievements {
  /** false면 업적이 없는 게임 */
  supported: boolean;
  private: boolean;
  achievements: SteamAchievement[];
}

export interface GameAchievementProgress {
  appId: number;
  name: string;
  /** 게임의 전체 업적 수 */
  total: number;
  achieved: number;
}

/** GET /api/me/steam/achievement-summary 응답. backend/src/services/achievementSummary.ts와 동일하게 유지할 것 */
export interface AchievementSummary {
  /** true면 프로필의 "게임 세부 정보"가 비공개라 게임 목록을 볼 수 없다 */
  private: boolean;
  /** 업적이 있는 게임의 달성 현황 (플레이 시간이 긴 순) */
  games: GameAchievementProgress[];
  /** 업적을 확인해 본 게임 수 (업적이 없는 게임 포함) */
  checked: number;
  /** 업적 공개 범위가 비공개라 못 본 게임 수 */
  hidden: number;
  /** 조회에 실패한 게임 수. 0보다 크면 일부가 빠진 결과다 */
  failed: number;
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

export type PopularPlatform = 'windows' | 'mac' | 'linux';

/** 인기 있는 게임 한 건 (SteamSpy 보유자 수 추정치 기반). backend/src/services/popular.ts와 동일하게 유지할 것. */
export interface PopularGame {
  appId: number;
  name: string;
  developer: string;
  publisher: string;
  /** 보유자 수 추정 구간. SteamSpy는 정확한 수가 아니라 구간만 준다 */
  ownersMin: number;
  ownersMax: number;
  /** 어제 기준 최대 동시 접속자 수 */
  ccu: number;
  /** 미국 스토어 기준 현재 가격(USD). 무료면 0 */
  priceUsd: number | null;
  discount: number;
  /** SteamSpy 장르 이름 (영어) */
  genres: string[];
  /** 아직 Steam 스토어에서 받아오지 못했으면 null */
  releaseYear: number | null;
  platforms: Record<PopularPlatform, boolean> | null;
  image: string;
}

export interface PopularFacet<T> {
  value: T;
  count: number;
}

/** GET /api/popular 응답 */
export interface PopularResponse {
  status: {
    /** false면 서버가 처음 데이터를 모으는 중이다 */
    ready: boolean;
    updatedAt: string | null;
    total: number;
    /** 출시 연도·플랫폼 정보를 채운 게임 수 (total보다 작으면 아직 채우는 중) */
    releaseChecked: number;
  };
  /** 필터를 적용한 결과 수 */
  total: number;
  page: number;
  pageSize: number;
  games: PopularGame[];
  /** 달러→원 환율. 조회하지 못했으면 null이고 가격은 달러로 보여 준다 */
  exchange: { krwPerUsd: number; date: string } | null;
  facets: {
    genres: PopularFacet<string>[];
    years: PopularFacet<number>[];
    platforms: PopularFacet<PopularPlatform>[];
  };
}
