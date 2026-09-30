import { describe, expect, it } from 'vitest';
import type { SteamOwnedGame } from '../types';
import { filterAndSort, formatTotalHours, placeAt, removeFrom, spineHue } from './library';

const g = (appId: number, name: string, playtimeMinutes: number, lastPlayedAt: string | null): SteamOwnedGame => ({
  appId,
  name,
  playtimeMinutes,
  lastPlayedAt,
  image: '',
  iconUrl: null,
  persona: null,
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

  it('이름 순 (한글이 영문보다 앞)', () => {
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

describe('placeAt', () => {
  it('진열장 안에서 앞→뒤: 대상이 있던 자리로 들어가고 사이 항목은 앞으로 당겨진다', () => {
    expect(placeAt([1, 2, 3, 4], 1, 3)).toEqual([2, 3, 1, 4]);
  });

  it('진열장 안에서 뒤→앞: 대상이 있던 자리로 들어가고 사이 항목은 뒤로 밀린다', () => {
    expect(placeAt([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3]);
  });

  it('서재에서 꺼내 온 게임은 대상 앞에 끼워 넣는다', () => {
    expect(placeAt([1, 2, 3], 9, 2)).toEqual([1, 9, 2, 3]);
  });

  it('targetId가 null이면 맨 뒤에 꽂고, 이미 있으면 맨 뒤로 옮긴다', () => {
    expect(placeAt([1, 2], 9, null)).toEqual([1, 2, 9]);
    expect(placeAt([1, 2, 3], 1, null)).toEqual([2, 3, 1]);
  });

  it('같은 자리이거나 대상이 진열장에 없으면 그대로', () => {
    const list = [1, 2, 3];
    expect(placeAt(list, 2, 2)).toBe(list);
    expect(placeAt(list, 1, 99)).toBe(list);
  });

  it('원본은 바꾸지 않는다', () => {
    const list = [1, 2, 3];
    placeAt(list, 1, 3);
    expect(list).toEqual([1, 2, 3]);
  });
});

describe('removeFrom · spineHue', () => {
  it('진열장에서 뺀다', () => {
    expect(removeFrom([1, 2, 3], 2)).toEqual([1, 3]);
    expect(removeFrom([1, 2, 3], 9)).toEqual([1, 2, 3]);
  });

  it('책등 색상은 게임마다 고정이고 0~359 안이다', () => {
    expect(spineHue(730)).toBe(spineHue(730));
    for (const id of [1, 730, 1086940, 99999999]) {
      expect(spineHue(id)).toBeGreaterThanOrEqual(0);
      expect(spineHue(id)).toBeLessThan(360);
    }
  });
});
