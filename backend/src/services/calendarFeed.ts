import { randomBytes } from 'node:crypto';
import { db } from '../db.ts';
import { buildIcs } from '../utils/ics.ts';
import { listFavorites } from './favorites.ts';

const selectToken = db.prepare('SELECT calendar_token FROM users WHERE id = ?');
const selectUserByToken = db.prepare('SELECT id, nickname FROM users WHERE calendar_token = ?');
const updateToken = db.prepare('UPDATE users SET calendar_token = ? WHERE id = ?');

const newToken = () => randomBytes(24).toString('base64url');

export function getOrCreateCalendarToken(userId: number): string {
  const existing = (selectToken.get(userId) as { calendar_token: string | null } | undefined)?.calendar_token;
  return existing ?? resetCalendarToken(userId);
}

export function resetCalendarToken(userId: number): string {
  const token = newToken();
  updateToken.run(token, userId);
  return token;
}

/** 토큰 주인의 관심 게임 캘린더(.ics). 토큰이 맞지 않으면 null */
export function buildFeedByToken(token: string): string | null {
  const user = selectUserByToken.get(token) as { id: number; nickname: string } | undefined;
  if (!user) return null;
  return buildIcs(`${user.nickname}의 관심 게임`, listFavorites(user.id));
}
