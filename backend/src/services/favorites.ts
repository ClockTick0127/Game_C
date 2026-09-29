import { db } from '../db.ts';
import type { Game } from '../types.ts';
import { HttpError } from '../utils/http.ts';

const MAX_FAVORITES = 500;

const selectAll = db.prepare('SELECT game FROM favorites WHERE user_id = ? ORDER BY released, created_at');
const countStmt = db.prepare('SELECT COUNT(*) AS count FROM favorites WHERE user_id = ?');
const upsert = db.prepare(`
  INSERT INTO favorites (user_id, game_id, released, game, created_at) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (user_id, game_id) DO UPDATE SET released = excluded.released, game = excluded.game
`);
const deleteStmt = db.prepare('DELETE FROM favorites WHERE user_id = ? AND game_id = ?');
const existsStmt = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND game_id = ?');

/** 출시일 순으로 정렬된 관심 게임 목록 */
export function listFavorites(userId: number): Game[] {
  return (selectAll.all(userId) as { game: string }[]).map((row) => JSON.parse(row.game) as Game);
}

/** 이미 추가된 게임이면 저장된 정보만 최신으로 갱신한다. */
export function addFavorite(userId: number, game: Game): void {
  const alreadyAdded = existsStmt.get(userId, game.id) !== undefined;
  if (!alreadyAdded && (countStmt.get(userId) as { count: number }).count >= MAX_FAVORITES) {
    throw new HttpError(400, `관심 게임은 최대 ${MAX_FAVORITES}개까지 추가할 수 있습니다.`);
  }
  upsert.run(userId, game.id, game.released, JSON.stringify(game), new Date().toISOString());
}

export function removeFavorite(userId: number, gameId: number): void {
  deleteStmt.run(userId, gameId);
}
