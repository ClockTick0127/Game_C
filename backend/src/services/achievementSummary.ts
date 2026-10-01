import { createPromiseCache } from '../utils/cache.ts';
import { HttpError } from '../utils/http.ts';
import { fetchAchievements, fetchOwnedGames } from './steamProfile.ts';

/** 업적을 확인하는 게임 수. 업적은 게임마다 Steam을 한 번씩 불러야 해서 플레이 시간이 긴 순으로 이만큼만 본다 */
export const SUMMARY_GAME_COUNT = 20;
/** Steam에 동시에 보내는 업적 요청 수 */
const CONCURRENCY = 4;
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface GameAchievementProgress {
  appId: number;
  name: string;
  /** 게임의 전체 업적 수 */
  total: number;
  achieved: number;
}

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

const cache = createPromiseCache<string, AchievementSummary>({
  ttlMs: CACHE_TTL_MS,
  maxEntries: 500,
  // 일부가 빠진 결과는 기억하지 않아 다시 누르면 처음부터 다시 시도한다
  shouldCache: (summary) => summary.failed === 0,
});

/** 플레이 시간 상위 게임들의 업적 달성 현황 */
export function summarizeAchievements(steamId: string): Promise<AchievementSummary> {
  return cache(steamId, async () => {
    const owned = await fetchOwnedGames(steamId);
    if (owned.private) return { private: true, games: [], checked: 0, hidden: 0, failed: 0 };

    // fetchOwnedGames는 플레이 시간이 긴 순이다. 플레이하지 않은 게임은 업적을 달성했을 수 없으니 보지 않는다
    const targets = owned.games.filter((g) => g.playtimeMinutes > 0).slice(0, SUMMARY_GAME_COUNT);
    const results: (Awaited<ReturnType<typeof fetchAchievements>> | null)[] = Array(targets.length).fill(null);
    let next = 0;

    async function worker() {
      while (next < targets.length) {
        const i = next++;
        try {
          results[i] = await fetchAchievements(steamId, targets[i]!.appId);
        } catch (err) {
          console.warn(`업적 조회 실패 (앱 ${targets[i]!.appId}):`, err instanceof HttpError ? err.detail : err);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));

    const summary: AchievementSummary = { private: false, games: [], checked: targets.length, hidden: 0, failed: 0 };
    results.forEach((result, i) => {
      const game = targets[i]!;
      if (!result) summary.failed++;
      else if (result.private) summary.hidden++;
      else if (result.supported && result.achievements.length > 0) {
        summary.games.push({
          appId: game.appId,
          name: game.name,
          total: result.achievements.length,
          achieved: result.achievements.filter((a) => a.achieved).length,
        });
      }
    });
    return summary;
  });
}
