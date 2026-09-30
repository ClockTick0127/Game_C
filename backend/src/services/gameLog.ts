import { db } from '../db.ts';
import { HttpError } from '../utils/http.ts';

/** 한 계정이 기록을 남길 수 있는 게임 수. 서재 배치와 같은 한도다 */
export const MAX_GAME_LOGS = 20_000;
/** 메모 글자 수 */
export const MAX_NOTE_LENGTH = 200;

export const GAME_STATUSES = ['playing', 'cleared', 'backlog', 'dropped'] as const;
/** 하는 중 · 클리어 · 쌓아둠 · 포기 */
export type GameStatus = (typeof GAME_STATUSES)[number];

/** 사용자가 채운 내용. 채우지 않은 칸은 status·rating이 null, note가 빈 문자열이다 */
export interface GameLogInput {
  status: GameStatus | null;
  rating: number | null;
  note: string;
}

/** gameId는 서재 번호(Steam 앱 번호, 직접 추가한 게임은 RAWG 번호 + 10억) */
export interface GameLog extends GameLogInput {
  gameId: number;
}

interface Row {
  game_id: number;
  status: GameStatus | null;
  rating: number | null;
  note: string;
}

const selectAll = db.prepare('SELECT game_id, status, rating, note FROM game_logs WHERE user_id = ? ORDER BY game_id');
const countStmt = db.prepare('SELECT COUNT(*) AS count FROM game_logs WHERE user_id = ?');
const existsStmt = db.prepare('SELECT 1 FROM game_logs WHERE user_id = ? AND game_id = ?');
const upsert = db.prepare(`
  INSERT INTO game_logs (user_id, game_id, status, rating, note, updated_at) VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT (user_id, game_id) DO UPDATE SET
    status = excluded.status, rating = excluded.rating, note = excluded.note, updated_at = excluded.updated_at
`);
const deleteStmt = db.prepare('DELETE FROM game_logs WHERE user_id = ? AND game_id = ?');

/** 남긴 기록 전체 (서재를 그릴 때 한 번에 받아 간다) */
export function listGameLogs(userId: number): GameLog[] {
  return (selectAll.all(userId) as unknown as Row[]).map((r) => ({
    gameId: r.game_id,
    status: r.status,
    rating: r.rating,
    note: r.note,
  }));
}

/** 통째로 덮어쓴다. 세 칸이 모두 비어 있으면 기록을 지운 것과 같다 */
export function saveGameLog(userId: number, gameId: number, log: GameLogInput): void {
  if (log.status === null && log.rating === null && log.note === '') {
    deleteStmt.run(userId, gameId);
    return;
  }
  if (!existsStmt.get(userId, gameId) && (countStmt.get(userId) as { count: number }).count >= MAX_GAME_LOGS) {
    throw new HttpError(400, `게임 기록은 최대 ${MAX_GAME_LOGS.toLocaleString('ko-KR')}개까지 남길 수 있습니다.`);
  }
  upsert.run(userId, gameId, log.status, log.rating, log.note, new Date().toISOString());
}

export function deleteGameLog(userId: number, gameId: number): void {
  deleteStmt.run(userId, gameId);
}

/** 요청 본문 검증. 빠진 칸은 비운 것으로 본다 */
export function parseGameLog(body: unknown): GameLogInput {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

  const status = b.status ?? null;
  if (status !== null && !GAME_STATUSES.includes(status as GameStatus)) {
    throw new HttpError(400, '플레이 상태가 올바르지 않습니다.');
  }

  const rating = b.rating ?? null;
  if (rating !== null && (!Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 5)) {
    throw new HttpError(400, '별점은 1~5 사이의 정수여야 합니다.');
  }

  const rawNote = b.note ?? '';
  if (typeof rawNote !== 'string') throw new HttpError(400, '메모가 올바르지 않습니다.');
  const note = rawNote.trim();
  if (note.length > MAX_NOTE_LENGTH) throw new HttpError(400, `메모는 ${MAX_NOTE_LENGTH}자 이하로 입력하세요.`);

  return { status: status as GameStatus | null, rating: rating as number | null, note };
}
