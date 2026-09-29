import { RAWG_API_KEY } from '../config.ts';
import type { ReleasesResponse } from '../types.ts';
import { createPromiseCache } from '../utils/cache.ts';
import { parseDateKey, toDateKey } from '../utils/date.ts';
import { fetchReleases, type ReleasesResult } from './rawg.ts';
import { getSampleReleases } from './sampleData.ts';

export const IS_SAMPLE_MODE = RAWG_API_KEY === '';

/**
 * 월 단위 조회 결과 캐시 (1시간). 요청한 기간이 아니라 달을 키로 삼아서, 기간을 조금씩 바꿔 가며
 * 캐시를 피해 RAWG를 계속 부르는 것을 막는다. 일부만 가져온 결과는 캐시하지 않아 다음 요청에서 다시 시도한다.
 */
const cachedMonth = createPromiseCache<string, ReleasesResult>({
  ttlMs: 60 * 60 * 1000,
  maxEntries: 100,
  shouldCache: (result) => !result.partial,
});

/** start ~ end가 걸쳐 있는 달들과 각 달의 첫날·마지막 날 */
function monthsBetween(start: string, end: string): { key: string; first: string; last: string }[] {
  const from = parseDateKey(start);
  const to = parseDateKey(end);
  const months = [];
  for (
    let d = new Date(from.getFullYear(), from.getMonth(), 1);
    d <= to;
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  ) {
    const first = toDateKey(d);
    months.push({ key: first.slice(0, 7), first, last: toDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0)) });
  }
  return months;
}

export async function getReleases(start: string, end: string): Promise<ReleasesResponse> {
  if (IS_SAMPLE_MODE) {
    return { games: getSampleReleases(start, end), sample: true };
  }

  const results = await Promise.all(
    monthsBetween(start, end).map((m) => cachedMonth(m.key, () => fetchReleases(m.first, m.last))),
  );
  const games = results.flatMap((r) => r.games).filter((g) => g.released >= start && g.released <= end);
  return { games, sample: false, ...(results.some((r) => r.partial) && { partial: true }) };
}
