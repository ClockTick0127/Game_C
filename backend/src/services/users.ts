import { db } from '../db.ts';
import { HttpError } from '../utils/http.ts';

/** 클라이언트에 내려주는 사용자 정보 (비밀번호 해시 제외) */
export interface User {
  id: number;
  email: string;
  nickname: string;
  createdAt: string;
}

export interface UserRow {
  id: number;
  email: string;
  nickname: string;
  password_hash: string;
  created_at: string;
}

export function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, nickname: row.nickname, createdAt: row.created_at };
}

const selectByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const selectById = db.prepare('SELECT * FROM users WHERE id = ?');
const insertUser = db.prepare('INSERT INTO users (email, nickname, password_hash, created_at) VALUES (?, ?, ?, ?)');
const updateNicknameStmt = db.prepare('UPDATE users SET nickname = ? WHERE id = ?');
const updatePasswordStmt = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
const deleteUserStmt = db.prepare('DELETE FROM users WHERE id = ?');

export function findUserRowByEmail(email: string): UserRow | undefined {
  return selectByEmail.get(email) as UserRow | undefined;
}

export function findUserRowById(id: number): UserRow | undefined {
  return selectById.get(id) as UserRow | undefined;
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
