import type { Game } from '../types';

export interface GameFilter {
  /** 게임 제목 검색어 */
  query: string;
  platform: string | null;
  genre: string | null;
  favoritesOnly: boolean;
}

export const NO_FILTER: GameFilter = { query: '', platform: null, genre: null, favoritesOnly: false };

export function isFilterActive(filter: GameFilter): boolean {
  return filter.query.trim() !== '' || filter.platform !== null || filter.genre !== null || filter.favoritesOnly;
}

/** 대소문자와 공백 차이를 무시하고 비교하기 위한 정규화 ("엘든 링" ↔ "엘든링", "ELDEN RING" ↔ "Elden Ring") */
function normalize(text: string): string {
  return text.toLocaleLowerCase().replace(/\s+/g, '');
}

export function filterGames(games: Game[], filter: GameFilter, isFavorite: (gameId: number) => boolean): Game[] {
  if (!isFilterActive(filter)) return games;

  const query = normalize(filter.query);
  return games.filter(
    (game) =>
      (query === '' || normalize(game.name).includes(query)) &&
      (filter.platform === null || game.platforms.includes(filter.platform)) &&
      (filter.genre === null || game.genres.includes(filter.genre)) &&
      (!filter.favoritesOnly || isFavorite(game.id)),
  );
}

export function groupByDate(games: Game[]): Map<string, Game[]> {
  const map = new Map<string, Game[]>();
  for (const game of games) {
    const list = map.get(game.released);
    if (list) list.push(game);
    else map.set(game.released, [game]);
  }
  return map;
}

/** 값을 많이 가진 순(같으면 가나다 순)으로 정렬한 선택지. `keep`은 목록에 없어도 남겨 둘 값(현재 선택). */
export function collectOptions(values: string[][], keep: string | null): string[] {
  const counts = new Map<string, number>();
  for (const list of values) for (const value of list) counts.set(value, (counts.get(value) ?? 0) + 1);
  if (keep !== null && !counts.has(keep)) counts.set(keep, 0);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko')).map(([value]) => value);
}
