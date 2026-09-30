import type { PopularPlatform, PopularResponse } from '../types';
import { request } from './client';

export interface PopularParams {
  q: string;
  genre: string;
  year: string;
  platform: PopularPlatform | '';
  sort: 'owners' | 'ccu';
  page: number;
}

export function fetchPopular(params: PopularParams, signal?: AbortSignal): Promise<PopularResponse> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.genre) query.set('genre', params.genre);
  if (params.year) query.set('year', params.year);
  if (params.platform) query.set('platform', params.platform);
  if (params.sort !== 'owners') query.set('sort', params.sort);
  if (params.page > 1) query.set('page', String(params.page));
  const qs = query.toString();
  return request(`/api/popular${qs ? `?${qs}` : ''}`, { signal });
}
