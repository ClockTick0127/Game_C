import { RAWG_API_KEY } from '../config.ts';
import type { Game, ReleasesResponse } from '../types.ts';
import { createPromiseCache } from '../utils/cache.ts';
import { fetchReleases } from './rawg.ts';
import { getSampleReleases } from './sampleData.ts';

export const IS_SAMPLE_MODE = RAWG_API_KEY === '';

/** 기간별 조회 결과 캐시 (1시간) */
const cachedReleases = createPromiseCache<string, Game[]>({ ttlMs: 60 * 60 * 1000, maxEntries: 100 });

export async function getReleases(start: string, end: string): Promise<ReleasesResponse> {
  if (IS_SAMPLE_MODE) {
    return { games: getSampleReleases(start, end), sample: true };
  }
  return { games: await cachedReleases(`${start}~${end}`, () => fetchReleases(start, end)), sample: false };
}
