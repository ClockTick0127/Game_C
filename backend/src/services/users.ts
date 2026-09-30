import { db } from '../db.ts';
import { HttpError } from '../utils/http.ts';

/** 클라이언트에 내려주는 사용자 정보 (비밀번호 해시 제외) */
export interface User {
  id: number;
  email: string;
  nickname: string;
  createdAt: string;
  /** 연동한 Steam 계정(SteamID64). 연동하지 않았으면 null */
  steamId: string | null;
}

export interface UserRow {
  id: number;
  email: string;
  nickname: string;
  password_hash: string;
  created_at: string;
  steam_id: string | null;
}

export function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, nickname: row.nickname, createdAt: row.created_at, steamId: row.steam_id };
}

const selectByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const selectById = db.prepare('SELECT * FROM users WHERE id = ?');
const insertUser = db.prepare('INSERT INTO users (email, nickname, password_hash, created_at) VALUES (?, ?, ?, ?)');
const selectBySteamId = db.prepare('SELECT * FROM users WHERE steam_id = ?');
const updateSteamIdStmt = db.prepare('UPDATE users SET steam_id = ? WHERE id = ?');
const updateNicknameStmt = db.prepare('UPDATE users SET nickname = ? WHERE id = ?');
const updatePasswordStmt = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
const deleteUserStmt = db.prepare('DELETE FROM users WHERE id = ?');

export function findUserRowByEmail(email: string): UserRow | undefined {
  return selectByEmail.get(email) as UserRow | undefined;
}

export function findUserRowById(id: number): UserRow | undefined {
  return selectById.get(id) as UserRow | undefined;
}

export function findUserRowBySteamId(steamId: string): UserRow | undefined {
  return selectBySteamId.get(steamId) as UserRow | undefined;
}

/** Steam 계정을 연결한다. 이미 다른 사용자가 연결한 계정이면 409. null이면 연동을 해제한다. */
export function setSteamId(id: number, steamId: string | null): User {
  try {
    updateSteamIdStmt.run(steamId, id);
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
      throw new HttpError(409, '이미 다른 계정에 연동된 Steam 계정입니다.');
    }
    throw err;
  }
  return toUser(findUserRowById(id)!);
}

export function createUser(email: string, nickname: string, passwordHash: string): User {
  try {
    const { lastInsertRowid } = insertUser.run(email, nickname, passwordHash, new Date().toISOString());
    return toUser(findUserRowById(Number(lastInsertRowid))!);
  } catch (err) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
      throw new HttpError(409, '이미 가입된 이메일입니다.');
    }
    throw err;
  }
}

export function updateNickname(id: number, nickname: string): User {
  updateNicknameStmt.run(nickname, id);
  return toUser(findUserRowById(id)!);
}

export function updatePasswordHash(id: number, passwordHash: string): void {
  updatePasswordStmt.run(passwordHash, id);
}

/** 세션과 관심 게임은 ON DELETE CASCADE로 함께 지워진다. */
export function deleteUser(id: number): void {
  deleteUserStmt.run(id);
}
