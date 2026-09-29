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

export interface ReleasesResponse {
  games: Game[];
  /** true면 백엔드에 API 키가 없어 샘플 데이터로 응답한 것 */
  sample: boolean;
}
