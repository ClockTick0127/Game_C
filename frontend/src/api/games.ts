import type { ReleasesResponse } from '../types';
import { request } from './client';

/** start ~ end(YYYY-MM-DD, 양 끝 포함) 기간에 출시되는 게임을 백엔드에서 가져온다. */
export function fetchReleases(start: string, end: string, signal?: AbortSignal): Promise<ReleasesResponse> {
  return request(`/api/games?${new URLSearchParams({ start, end })}`, { signal });
}
