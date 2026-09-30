import { db } from '../db.ts';
import { HttpError } from '../utils/http.ts';

/** 한 계정이 직접 추가할 수 있는 게임 수 */
export const MAX_CUSTOM_GAMES = 500;

/** RAWG에서 찾아 서재에 직접 추가한 게임. 서재에 그릴 때 외부 API를 다시 부르지 않도록 이름과 표지를 저장한다 */
export interface CustomGame {
  /** RAWG 게임 번호 */
  id: number;
  name: string;
  image: string | null;
}

const selectAll = db.prepare(
  'SELECT game_id, name, image FROM custom_library_games WHERE user_id = ? ORDER BY added_at',
);
const countStmt = db.prepare('SELECT COUNT(*) AS count FROM custom_library_games WHERE user_id = ?');
const existsStmt = db.prepare('SELECT 1 FROM custom_library_games WHERE user_id = ? AND game_id = ?');
const upsert = db.prepare(`
  INSERT INTO custom_library_games (user_id, game_id, name, image, added_at) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (user_id, game_id) DO UPDATE SET name = excluded.name, image = excluded.image
`);
const deleteStmt = db.prepare('DELETE FROM custom_library_games WHERE user_id = ? AND game_id = ?');

export function listCustomGames(userId: number): CustomGame[] {
  return (selectAll.all(userId) as { game_id: number; name: string; image: string | null }[]).map((r) => ({
    id: r.game_id,
    name: r.name,
    image: r.image,
  }));
}

/** 이미 추가한 게임이면 저장된 정보만 갱신한다 */
export function addCustomGame(userId: number, game: CustomGame): void {
  if (!existsStmt.get(userId, game.id) && (countStmt.get(userId) as { count: number }).count >= MAX_CUSTOM_GAMES) {
    throw new HttpError(400, `직접 추가한 게임은 최대 ${MAX_CUSTOM_GAMES}개까지 둘 수 있습니다.`);
  }
  upsert.run(userId, game.id, game.name, game.image, new Date().toISOString());
}

export function removeCustomGame(userId: number, gameId: number): void {
  deleteStmt.run(userId, gameId);
}

/** 요청 본문 검증. 표지는 https 주소만 받는다 */
export function parseCustomGame(body: unknown): CustomGame {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!Number.isSafeInteger(b.id) || (b.id as number) <= 0) throw new HttpError(400, '게임 ID가 올바르지 않습니다.');
  if (!name || name.length > 200) throw new HttpError(400, '게임 이름이 올바르지 않습니다.');
  const image = typeof b.image === 'string' && b.image.startsWith('https://') && b.image.length <= 500 ? b.image : null;
  return { id: b.id as number, name, image };
}
