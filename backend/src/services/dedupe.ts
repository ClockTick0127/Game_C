import type { Game } from '../types.ts';
import { normalizeTitle } from '../utils/text.ts';

/**
 * RAWG는 이용자가 게임을 직접 등록할 수 있어서 같은 게임이 두 번 등록된 경우가 있다.
 * (예: "Silent Hill Townfall"과 "Silent Hill: Townfall", 출시일·플랫폼·퍼블리셔 동일)
 * 대소문자·기호·띄어쓰기를 무시한 이름과 출시일이 모두 같으면 같은 게임으로 본다.
 */
function dedupeKey(game: Game): string | null {
  const name = normalizeTitle(game.name);
  return name ? `${game.released}|${name}` : null; // 이름이 전부 기호라면 합치지 않는다
}

function union(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

/** 먼저 나온 쪽(인기순 정렬이므로 더 많이 등록된 쪽)을 남기고, 비어 있는 정보는 중복 항목에서 채운다. */
function merge(keep: Game, dup: Game): Game {
  return {
    ...keep,
    image: keep.image ?? dup.image,
    rating: keep.rating || dup.rating,
    metacritic: keep.metacritic ?? dup.metacritic,
    platforms: union(keep.platforms, dup.platforms),
    genres: union(keep.genres, dup.genres),
    persona: keep.persona ?? dup.persona,
  };
}

export function dedupeGames(games: Game[]): Game[] {
  const indexByKey = new Map<string, number>();
  const result: Game[] = [];

  for (const game of games) {
    const key = dedupeKey(game);
    const index = key ? indexByKey.get(key) : undefined;
    if (index !== undefined) {
      result[index] = merge(result[index], game);
    } else {
      if (key) indexByKey.set(key, result.length);
      result.push(game);
    }
  }
  return result;
}
