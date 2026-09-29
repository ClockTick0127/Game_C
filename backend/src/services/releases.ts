import { RAWG_API_KEY } from '../config.ts';
import type { Game, ReleasesResponse } from '../types.ts';
import { fetchReleases } from './rawg.ts';
import { getSampleReleases } from './sampleData.ts';

export const IS_SAMPLE_MODE = RAWG_API_KEY === '';

const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;

/**
 * 기간별 조회 결과 캐시. Promise를 저장하므로 같은 기간을 동시에 요청해도 RAWG는 한 번만 호출된다.
 * 실패한 요청은 캐시에서 지워 다음 요청 때 다시 시도한다.
 */
const cache = new Map<string, { expiresAt: number; promise: Promise<Game[]> }>();

function getCachedReleases(start: string, end: string): Promise<Game[]> {
  const key = `${start}~${end}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.promise;

  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Map은 삽입 순서를 유지하므로 첫 항목이 가장 오래된 것
    cache.delete(cache.keys().next().value!);
  }

  const entry = { expiresAt: Date.now() + CACHE_TTL_MS, promise: fetchReleases(start, end, RAWG_API_KEY) };
  cache.set(key, entry);
  entry.promise.catch(() => {
    if (cache.get(key) === entry) cache.delete(key);
  });
  return entry.promise;
}

export async function getReleases(start: string, end: string): Promise<ReleasesResponse> {
  if (IS_SAMPLE_MODE) {
    return { games: getSampleReleases(start, end), sample: true };
  }
  return { games: await getCachedReleases(start, end), sample: false };
}
