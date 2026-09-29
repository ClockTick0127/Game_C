import { describe, expect, it } from 'vitest';
import { makeGame } from '../test/fixtures';
import { collectOptions, filterGames, groupByDate, isFilterActive, NO_FILTER } from './filterGames';

const games = [
  makeGame(1, { name: 'Elden Ring', platforms: ['PC', 'PlayStation 5'], genres: ['RPG', 'Action'] }),
  makeGame(2, { name: '엘든 링 확장팩', platforms: ['PC'], genres: ['RPG'] }),
  makeGame(3, { name: 'Forza', platforms: ['Xbox Series S/X'], genres: ['Racing'] }),
];
const never = () => false;

describe('filterGames', () => {
  it('필터가 없으면 같은 배열을 그대로 돌려준다', () => {
    expect(isFilterActive(NO_FILTER)).toBe(false);
    expect(filterGames(games, NO_FILTER, never)).toBe(games);
  });

  it('제목은 대소문자와 공백을 무시하고 부분 일치로 찾는다', () => {
    const ids = (query: string) => filterGames(games, { ...NO_FILTER, query }, never).map((g) => g.id);
    expect(ids('ELDEN')).toEqual([1]);
    expect(ids('엘든링')).toEqual([2]);
    expect(ids('  el den  ')).toEqual([1]);
    expect(ids('없는게임')).toEqual([]);
  });

  it('플랫폼·장르·관심 게임 조건은 모두 만족해야 한다', () => {
    const fav = (id: number) => id === 2;
    expect(filterGames(games, { ...NO_FILTER, platform: 'PC' }, never).map((g) => g.id)).toEqual([1, 2]);
    expect(filterGames(games, { ...NO_FILTER, platform: 'PC', genre: 'Action' }, never).map((g) => g.id)).toEqual([1]);
    expect(filterGames(games, { ...NO_FILTER, platform: 'PC', favoritesOnly: true }, fav).map((g) => g.id)).toEqual([
      2,
    ]);
  });
});

describe('groupByDate', () => {
  it('출시일별로 묶고 입력 순서를 유지한다', () => {
    const map = groupByDate([
      makeGame(1, { released: '2030-01-05' }),
      makeGame(2, { released: '2030-01-06' }),
      makeGame(3, { released: '2030-01-05' }),
    ]);
    expect(map.get('2030-01-05')?.map((g) => g.id)).toEqual([1, 3]);
    expect(map.get('2030-01-06')?.map((g) => g.id)).toEqual([2]);
  });
});

describe('collectOptions', () => {
  it('많이 나온 순으로 정렬하고, 현재 선택값은 목록에 없어도 남긴다', () => {
    const lists = games.map((g) => g.genres);
    expect(collectOptions(lists, null)).toEqual(['RPG', 'Action', 'Racing']);
    expect(collectOptions(lists, 'Puzzle')).toEqual(['RPG', 'Action', 'Racing', 'Puzzle']);
  });
});
