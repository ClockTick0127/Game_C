import { describe, expect, it } from 'vitest';
import type { GameLog, SteamOwnedGame } from '../types';
import {
  filterAndSort,
  filterByStatus,
  formatTotalHours,
  gameLabel,
  logSummary,
  placeAt,
  removeFrom,
  showcaseToOwned,
  spineHue,
  STATUS_FILTER_LABELS,
  toLibraryId,
} from './library';

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

describe('플레이 상태·별점 기록', () => {
  const log = (gameId: number, status: GameLog['status'], rating: number | null = null, note = ''): GameLog => ({
    gameId,
    status,
    rating,
    note,
  });
  const logs = {
    1: log(1, 'playing', 4),
    2: log(2, 'cleared'),
    3: log(3, null, 5, '상태는 안 정함'),
  };

  it('요약은 "상태 · 별점"이고, 상태와 별점이 없으면(메모만 있으면) 비어 있다', () => {
    expect(logSummary(log(1, 'cleared', 4))).toBe('클리어 · ★4');
    expect(logSummary(log(1, 'backlog'))).toBe('쌓아둠');
    expect(logSummary(log(1, null, 3))).toBe('★3');
    expect(logSummary(log(1, null, null, '메모만'))).toBe('');
    expect(logSummary(undefined)).toBe('');
  });

  it('게임 안내 문구는 플레이 시간 뒤에 기록 요약이 붙는다', () => {
    expect(gameLabel(games[0]!, log(1, 'cleared', 5))).toBe('10.0시간 · 클리어 · ★5');
    expect(gameLabel(games[0]!, undefined)).toBe('10.0시간');
  });

  it('상태로 거른다. 전체는 그대로, 상태 없음은 기록이 없거나 상태를 안 정한 게임', () => {
    expect(filterByStatus(games, logs, 'all')).toBe(games);
    expect(names(filterByStatus(games, logs, 'playing'))).toEqual(['Terraria']);
    expect(names(filterByStatus(games, logs, 'cleared'))).toEqual(['Portal']);
    expect(filterByStatus(games, logs, 'dropped')).toEqual([]);
    // Never Played(3)는 별점만 있고 상태가 없고, 가나다(4)는 기록이 없다
    expect(names(filterByStatus(games, logs, 'none'))).toEqual(['Never Played', '가나다']);
  });

  it('필터 목록은 전체 → 네 가지 상태 → 상태 없음 순서다', () => {
    expect(Object.keys(STATUS_FILTER_LABELS)).toEqual(['all', 'playing', 'cleared', 'backlog', 'dropped', 'none']);
  });
});

describe('showcaseToOwned', () => {
  const base = { playtimeMinutes: 0, image: null, steamAppId: null, status: null, rating: null };

  it('Steam 게임은 가로 헤더 이미지와 플레이 시간을 갖고, 기록이 없으면 log는 없다', () => {
    const { game, log } = showcaseToOwned({ ...base, appId: 20, name: 'Long', playtimeMinutes: 600, custom: false });
    expect(game).toMatchObject({ appId: 20, name: 'Long', playtimeMinutes: 600 });
    expect(game.custom).toBeUndefined();
    expect(game.image).toBe('https://cdn.akamai.steamstatic.com/steam/apps/20/header.jpg');
    expect(log).toBeUndefined();
  });

  it('상태나 별점이 있으면 메모 없는 기록을 만든다', () => {
    const { log } = showcaseToOwned({ ...base, appId: 20, name: 'Long', custom: false, status: 'cleared', rating: 5 });
    expect(log).toEqual({ gameId: 20, status: 'cleared', rating: 5, note: '' });
  });

  it('직접 추가한 게임은 서재와 같은 모양(Steam 표지 우선)으로 바꾼다', () => {
    const { game } = showcaseToOwned({
      ...base,
      appId: toLibraryId(3498),
      name: 'GTA V',
      custom: true,
      image: 'https://media.rawg.io/a.jpg',
      steamAppId: 271590,
    });
    expect(game).toMatchObject({ appId: toLibraryId(3498), custom: true, steamAppId: 271590 });
    expect(game.coverUrl).toContain('/271590/library_600x900.jpg');
  });
});
