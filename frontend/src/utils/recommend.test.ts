import { describe, expect, it } from 'vitest';
import type { GameLog, GameStatus, Persona, SteamOwnedGame } from '../types';
import { candidatePicks, personaAffinity, recommendGames } from './recommend';

const NOW = new Date('2026-10-10T00:00:00.000Z').getTime();

const game = (
  appId: number,
  name: string,
  playtimeMinutes: number,
  persona: Persona | null = null,
  extra: Partial<SteamOwnedGame> = {},
): SteamOwnedGame => ({
  appId,
  name,
  playtimeMinutes,
  lastPlayedAt: null,
  image: '',
  iconUrl: null,
  persona,
  ...extra,
});

const log = (gameId: number, status: GameStatus | null, rating: number | null = null): GameLog => ({
  gameId,
  status,
  rating,
  note: '',
});
const logsOf = (...list: GameLog[]) => Object.fromEntries(list.map((l) => [l.gameId, l]));

describe('candidatePicks', () => {
  it('클리어·포기한 게임과 이미 충분히 해 본 게임은 후보가 아니다', () => {
    const games = [
      game(1, 'Cleared', 0),
      game(2, 'Dropped', 0),
      game(3, 'Played a lot', 600),
      game(4, 'Never played', 0),
    ];
    const picks = candidatePicks(games, logsOf(log(1, 'cleared'), log(2, 'dropped')), NOW);
    expect(picks.map((p) => p.game.name)).toEqual(['Never played']);
  });

  it('상태에 따라 점수와 이유가 다르다: 하는 중 > 쌓아둠 > 안 해 봄 > 해 보다 만 게임', () => {
    const games = [
      game(1, 'Playing', 300, null, { lastPlayedAt: '2026-10-07T00:00:00.000Z' }),
      game(2, 'Backlog', 0),
      game(3, 'Unplayed', 0),
      game(4, 'Barely', 45),
    ];
    const picks = candidatePicks(games, logsOf(log(1, 'playing'), log(2, 'backlog')), NOW);
    const byName = Object.fromEntries(picks.map((p) => [p.game.name, p]));

    expect(byName.Playing!.reasons[0]).toBe('3일 전까지 하던 게임이에요. 이어서 해 볼까요?');
    expect(byName.Backlog!.reasons[0]).toContain('쌓아 둔');
    expect(byName.Unplayed!.reasons[0]).toContain('한 번도 안 해 본');
    expect(byName.Barely!.reasons[0]).toBe('45분만 해 보고 만 게임이에요.');
    expect(byName.Playing!.score).toBeGreaterThan(byName.Backlog!.score);
    expect(byName.Backlog!.score).toBeGreaterThan(byName.Unplayed!.score);
    expect(byName.Unplayed!.score).toBeGreaterThan(byName.Barely!.score);
  });

  it('직접 꽂아 둔 게임은 플레이 시간을 모르므로 그에 맞는 이유를 쓴다', () => {
    const picks = candidatePicks([game(1_000_000_001, 'Custom', 0, null, { custom: true })], {}, NOW);
    expect(picks[0]!.reasons[0]).toBe('서재에 꽂아 두기만 한 게임이에요.');
  });

  it('즐겨 하는 분위기의 게임은 점수가 오르고 이유가 붙는다', () => {
    const games = [game(1, 'Loved SF', 3000, 'scifi'), game(2, 'New SF', 0, 'scifi'), game(3, 'New Cute', 0, 'cute')];
    const picks = candidatePicks(games, logsOf(log(1, 'cleared', 5)), NOW);
    const byName = Object.fromEntries(picks.map((p) => [p.game.name, p]));

    expect(byName['New SF']!.reasons).toEqual([
      '가지고만 있고 한 번도 안 해 본 게임이에요.',
      'SF 게임을 즐겨 하시네요.',
    ]);
    expect(byName['New SF']!.score).toBeGreaterThan(byName['New Cute']!.score);
    expect(byName['New Cute']!.reasons).toHaveLength(1);
  });
});

describe('personaAffinity', () => {
  it('가장 좋아하는 분위기가 1이고, 별점이 낮거나 포기한 분위기는 0까지 내려간다', () => {
    const games = [
      game(1, 'A', 6000, 'action'),
      game(2, 'B', 600, 'horror'),
      game(3, 'C', 600, 'cute'),
      game(4, 'D', 600, 'retro'),
    ];
    const affinity = personaAffinity(games, logsOf(log(1, 'cleared', 5), log(3, 'dropped', 1)));
    expect(affinity.get('action')).toBe(1);
    expect(affinity.get('horror')).toBeGreaterThan(0);
    expect(affinity.get('horror')).toBeLessThan(1);
    expect(affinity.get('cute')).toBe(0);
  });

  it('분위기를 모르는 게임과 "기타"는 계산하지 않는다', () => {
    expect(personaAffinity([game(1, 'A', 600, null), game(2, 'B', 600, 'default')], {}).size).toBe(0);
  });
});

describe('recommendGames', () => {
  const games = Array.from({ length: 6 }, (_, i) => game(i + 1, `Game ${i + 1}`, 0));

  it('요청한 개수만큼 중복 없이 고른다', () => {
    const picks = recommendGames(games, {}, { count: 3, now: NOW });
    expect(picks).toHaveLength(3);
    expect(new Set(picks.map((p) => p.game.appId)).size).toBe(3);
  });

  it('난수에 따라 다른 게임이 뽑힌다 (다시 뽑기)', () => {
    const first = recommendGames(games, {}, { count: 1, random: () => 0, now: NOW });
    const last = recommendGames(games, {}, { count: 1, random: () => 0.999, now: NOW });
    expect(first[0]!.game.appId).not.toBe(last[0]!.game.appId);
  });

  it('점수가 높은 게임이 더 잘 뽑힌다', () => {
    const mixed = [game(1, 'Playing', 100), game(2, 'Unplayed', 0)];
    const logs = logsOf(log(1, 'playing'));
    // 하는 중(점수 3 → 가중치 9)과 안 해 봄(1.5 → 2.25): 0.8은 하는 중 구간(전체의 약 80%)에 들어간다
    expect(recommendGames(mixed, logs, { count: 1, random: () => 0.79, now: NOW })[0]!.game.name).toBe('Playing');
    expect(recommendGames(mixed, logs, { count: 1, random: () => 0.9, now: NOW })[0]!.game.name).toBe('Unplayed');
  });

  it('후보가 요청한 개수보다 적으면 있는 만큼만, 없으면 빈 목록', () => {
    expect(recommendGames(games.slice(0, 2), {}, { count: 3, now: NOW })).toHaveLength(2);
    expect(recommendGames([game(1, 'Done', 0)], logsOf(log(1, 'cleared')), { now: NOW })).toEqual([]);
  });
});
