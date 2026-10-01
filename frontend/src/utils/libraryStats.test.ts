import { describe, expect, it } from 'vitest';
import type { AchievementSummary, GameLog, Persona, SteamOwnedGame } from '../types';
import {
  achievementStats,
  byLastPlayedYear,
  byPersona,
  formatHours,
  percent,
  summarizeLibrary,
  summarizeLogs,
  topPlayed,
} from './libraryStats';

const g = (
  appId: number,
  name: string,
  playtimeMinutes: number,
  persona: Persona | null = 'default',
  lastPlayedAt: string | null = null,
): SteamOwnedGame => ({ appId, name, playtimeMinutes, lastPlayedAt, image: '', iconUrl: null, persona });

describe('formatHours · percent', () => {
  it('1시간 미만은 분, 100시간 미만은 소수 첫째 자리, 그 이상은 반올림', () => {
    expect(formatHours(0)).toBe('0분');
    expect(formatHours(45)).toBe('45분');
    expect(formatHours(90)).toBe('1.5시간');
    expect(formatHours(60 * 99.9)).toBe('99.9시간');
    expect(formatHours(60 * 1234 + 20)).toBe('1,234시간');
  });

  it('백분율은 반올림하고, 0으로 나누지 않는다', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(5, 0)).toBe(0);
  });
});

describe('summarizeLibrary', () => {
  it('플레이한 게임과 안 한 게임, 총 시간, 플레이한 게임당 평균', () => {
    const s = summarizeLibrary([g(1, 'A', 600), g(2, 'B', 0), g(3, 'C', 300), g(4, 'D', 0)]);
    expect(s).toEqual({ games: 4, played: 2, unplayed: 2, totalMinutes: 900, averageMinutes: 450 });
  });

  it('게임이 없거나 아무것도 안 했으면 평균은 0', () => {
    expect(summarizeLibrary([])).toEqual({ games: 0, played: 0, unplayed: 0, totalMinutes: 0, averageMinutes: 0 });
    expect(summarizeLibrary([g(1, 'A', 0)]).averageMinutes).toBe(0);
  });
});

describe('byPersona', () => {
  it('분위기별로 시간과 게임 수를 합하고, 시간이 많은 순으로 놓는다', () => {
    const { bars, pending } = byPersona([
      g(1, 'A', 100, 'action'),
      g(2, 'B', 500, 'fantasy'),
      g(3, 'C', 200, 'action'),
      g(4, 'D', 0, 'horror'),
    ]);
    expect(bars).toEqual([
      { persona: 'fantasy', minutes: 500, games: 1 },
      { persona: 'action', minutes: 300, games: 2 },
      { persona: 'horror', minutes: 0, games: 1 },
    ]);
    expect(pending).toBe(0);
  });

  it('분위기를 아직 모르는 게임(null)은 막대에 넣지 않고 개수만 센다', () => {
    const { bars, pending } = byPersona([g(1, 'A', 100, null), g(2, 'B', 50, 'cute'), g(3, 'C', 0, null)]);
    expect(bars.map((b) => b.persona)).toEqual(['cute']);
    expect(pending).toBe(2);
  });

  it('시간이 같으면 게임이 많은 쪽이 앞이다', () => {
    const { bars } = byPersona([g(1, 'A', 0, 'retro'), g(2, 'B', 0, 'cute'), g(3, 'C', 0, 'cute')]);
    expect(bars.map((b) => b.persona)).toEqual(['cute', 'retro']);
  });
});

describe('byLastPlayedYear', () => {
  it('마지막 플레이 연도별 게임 수를 오래된 해부터 센다. 플레이한 적 없는 게임은 뺀다', () => {
    const years = byLastPlayedYear([
      g(1, 'A', 1, 'default', '2024-06-01T00:00:00.000Z'),
      g(2, 'B', 1, 'default', '2022-06-01T00:00:00.000Z'),
      g(3, 'C', 1, 'default', '2024-12-31T23:00:00.000Z'),
      g(4, 'D', 0, 'default', null),
    ]);
    expect(years).toEqual([
      { year: 2022, games: 1 },
      { year: 2024, games: 2 },
    ]);
  });

  it('보는 사람의 시간대와 상관없이 저장된 시각(UTC)의 연도를 쓴다', () => {
    expect(byLastPlayedYear([g(1, 'A', 1, 'default', '2023-12-31T23:59:59.000Z')])).toEqual([{ year: 2023, games: 1 }]);
  });
});

describe('topPlayed', () => {
  it('플레이 시간이 긴 순으로 n개, 안 한 게임은 뺀다', () => {
    const list = [g(1, 'A', 10), g(2, 'B', 500), g(3, 'C', 0), g(4, 'D', 300), g(5, 'E', 300)];
    expect(topPlayed(list, 3).map((x) => x.name)).toEqual(['B', 'D', 'E']);
    expect(topPlayed(list, 10).map((x) => x.name)).toEqual(['B', 'D', 'E', 'A']);
  });

  it('원본 배열은 바꾸지 않는다', () => {
    const list = [g(1, 'A', 10), g(2, 'B', 500)];
    topPlayed(list);
    expect(list.map((x) => x.name)).toEqual(['A', 'B']);
  });
});

describe('summarizeLogs', () => {
  const log = (gameId: number, status: GameLog['status'], rating: number | null, note = ''): GameLog => ({
    gameId,
    status,
    rating,
    note,
  });

  it('상태별 게임 수와 별점 평균(소수 첫째 자리)을 센다', () => {
    const logs = {
      1: log(1, 'cleared', 5),
      2: log(2, 'cleared', 4),
      3: log(3, 'playing', 4),
      4: log(4, null, null, '메모만'),
    };
    const s = summarizeLogs(logs, new Set([1, 2, 3, 4]));
    expect(s.counts).toEqual({ playing: 1, cleared: 2, backlog: 0, dropped: 0 });
    expect(s.rated).toBe(3);
    expect(s.averageRating).toBe(4.3);
    expect(s.logged).toBe(4);
  });

  it('서재에 없는 게임의 기록은 세지 않는다', () => {
    const s = summarizeLogs({ 1: log(1, 'dropped', 1), 9: log(9, 'cleared', 5) }, new Set([1]));
    expect(s.counts.cleared).toBe(0);
    expect(s.averageRating).toBe(1);
    expect(s.logged).toBe(1);
  });

  it('별점이 없으면 평균은 null', () => {
    expect(summarizeLogs({ 1: log(1, 'backlog', null) }, new Set([1])).averageRating).toBeNull();
    expect(summarizeLogs({}, new Set()).logged).toBe(0);
  });
});

describe('achievementStats', () => {
  const summary = (games: AchievementSummary['games']): AchievementSummary => ({
    private: false,
    games,
    checked: games.length,
    hidden: 0,
    failed: 0,
  });

  it('업적 수를 모두 합해 달성률을 내고, 전부 달성한 게임을 센다', () => {
    const s = achievementStats(
      summary([
        { appId: 1, name: 'A', total: 10, achieved: 5 },
        { appId: 2, name: 'B', total: 2, achieved: 2 },
        { appId: 3, name: 'C', total: 8, achieved: 0 },
      ]),
    );
    // 게임별 평균(50·100·0 → 50%)이 아니라 7 / 20 = 35%
    expect(s).toEqual({ achieved: 7, total: 20, percent: 35, perfect: 1 });
  });

  it('업적이 있는 게임이 없으면 모두 0', () => {
    expect(achievementStats(summary([]))).toEqual({ achieved: 0, total: 0, percent: 0, perfect: 0 });
  });
});
