import { describe, expect, it } from 'vitest';
import type { SteamOwnedGame } from '../types';
import { filterAndSort, formatTotalHours } from './library';

const g = (appId: number, name: string, playtimeMinutes: number, lastPlayedAt: string | null): SteamOwnedGame => ({
  appId,
  name,
  playtimeMinutes,
  lastPlayedAt,
  image: '',
});

const games = [
  g(1, 'Terraria', 600, '2024-01-01T00:00:00.000Z'),
  g(2, 'Portal', 90, '2025-06-01T00:00:00.000Z'),
  g(3, 'Never Played', 0, null),
  g(4, '가나다', 90, '2023-01-01T00:00:00.000Z'),
];
const names = (list: SteamOwnedGame[]) => list.map((x) => x.name);

describe('filterAndSort', () => {
  it('플레이 시간이 긴 순, 같으면 이름 순', () => {
    expect(names(filterAndSort(games, '', 'playtime'))).toEqual(['Terraria', '가나다', 'Portal', 'Never Played']);
  });

  it('최근 플레이 순이면 플레이한 적 없는 게임이 맨 뒤', () => {
    expect(names(filterAndSort(games, '', 'recent'))).toEqual(['Portal', 'Terraria', '가나다', 'Never Played']);
  });

  it('이름 순', () => {
    expect(names(filterAndSort(games, '', 'name'))).toEqual(['가나다', 'Never Played', 'Portal', 'Terraria']);
  });

  it('이름으로 검색한다 (대소문자 무시)', () => {
    expect(names(filterAndSort(games, 'TERR', 'name'))).toEqual(['Terraria']);
    expect(filterAndSort(games, '없음', 'name')).toEqual([]);
  });

  it('원본 배열은 바꾸지 않는다', () => {
    const copy = [...games];
    filterAndSort(games, '', 'name');
    expect(games).toEqual(copy);
  });

  it('전체 플레이 시간', () => {
    expect(formatTotalHours(60 * 1234)).toBe('1,234시간');
  });
});
