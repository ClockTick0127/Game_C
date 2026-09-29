import { createHash, randomBytes } from 'node:crypto';
import { db } from '../db.ts';
import { toUser, type User, type UserRow } from './users.ts';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

const insertSession = db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)');
const deleteExpired = db.prepare('DELETE FROM sessions WHERE expires_at <= ?');
const selectSessionUser = db.prepare(`
  SELECT users.* FROM sessions
  JOIN users ON users.id = sessions.user_id
  WHERE sessions.token_hash = ? AND sessions.expires_at > ?
`);
const deleteByToken = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
const deleteOthers = db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?');

/** 새 세션을 만들고 쿠키에 넣을 토큰 원문을 돌려준다. */
export function createSession(userId: number): { token: string; expiresAt: number } {
  const now = Date.now();
  deleteExpired.run(now);

  const token = randomBytes(32).toString('base64url');
  const expiresAt = now + SESSION_TTL_MS;
  insertSession.run(hashToken(token), userId, expiresAt);
  return { token, expiresAt };
}

export function findSessionUser(token: string): User | null {
  const row = selectSessionUser.get(hashToken(token), Date.now()) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function deleteSession(token: string): void {
  deleteByToken.run(hashToken(token));
}

/** 비밀번호 변경 시 현재 세션을 제외한 다른 기기의 로그인을 해제한다. */
export function deleteOtherSessions(userId: number, keepToken: string): void {
  deleteOthers.run(userId, hashToken(keepToken));
}
