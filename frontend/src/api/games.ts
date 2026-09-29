import type { Game, ReleasesResponse, StoreInfo } from '../types';
import { request } from './client';

/** start ~ end(YYYY-MM-DD, 양 끝 포함) 기간에 출시되는 게임을 백엔드에서 가져온다. */
export function fetchReleases(start: string, end: string, signal?: AbortSignal): Promise<ReleasesResponse> {
  return request(`/api/games?${new URLSearchParams({ start, end })}`, { signal });
}

/** 스토어 바로가기 링크와 Steam 사용자 평가 */
export function fetchStoreInfo(gameId: number, signal?: AbortSignal): Promise<StoreInfo> {
  return request(`/api/games/${gameId}/store-info`, { signal });
}

/** 이름과 출시 연도로 게임 하나를 찾는다. 못 찾으면(404) 예외가 발생한다. */
export function searchGame(name: string, year: number, signal?: AbortSignal): Promise<Game> {
  return request(`/api/games/search?${new URLSearchParams({ name, year: String(year) })}`, { signal });
}
