import type { Game, ReleasesResponse, StoreInfo, Suggestions } from '../types';
import { request } from './client';

/** start ~ end(YYYY-MM-DD, 양 끝 포함) 기간에 출시되는 게임을 백엔드에서 가져온다. */
export function fetchReleases(start: string, end: string, signal?: AbortSignal): Promise<ReleasesResponse> {
  return request(`/api/games?${new URLSearchParams({ start, end })}`, { signal });
}

/** 스토어 바로가기 링크와 Steam 사용자 평가 */
export function fetchStoreInfo(gameId: number, signal?: AbortSignal): Promise<StoreInfo> {
  return request(`/api/games/${gameId}/store-info`, { signal });
}

/** 이름으로 게임을 찾아 목록으로 돌려준다 (한글 검색어 가능, 출시일이 정해지지 않은 게임은 released가 빈 문자열). 로그인하지 않아도 쓸 수 있다 */
export function findGames(q: string, signal?: AbortSignal): Promise<{ games: Game[] }> {
  return request(`/api/games/find?${new URLSearchParams({ q })}`, { signal });
}

/** 게임 검색 첫 화면의 추천: 서재 취향에 맞는 신작·예정작, 취향을 모르면 곧 나오는 인기 게임 */
export function fetchSuggestions(signal?: AbortSignal): Promise<Suggestions> {
  return request('/api/games/suggestions', { signal });
}

/** 이름과 출시 연도로 게임 하나를 찾는다. 못 찾으면(404) 예외가 발생한다. */
export function searchGame(name: string, year: number, signal?: AbortSignal): Promise<Game> {
  return request(`/api/games/search?${new URLSearchParams({ name, year: String(year) })}`, { signal });
}
