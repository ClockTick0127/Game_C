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
  /** 선호 플랫폼·장르. 캘린더를 열 때 기본 필터로 적용된다. 정하지 않았으면 null */
  preferredPlatform: string | null;
  preferredGenre: string | null;
  /** true면 누구나 /u/닉네임 에서 내 진열장을 볼 수 있다 */
  profilePublic: boolean;
}

export interface UserRow {
  id: number;
  email: string;
  nickname: string;
  password_hash: string;
  created_at: string;
  steam_id: string | null;
  pref_platform: string | null;
  pref_genre: string | null;
  profile_public: number;
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    nickname: row.nickname,
    createdAt: row.created_at,
    steamId: row.steam_id,
    preferredPlatform: row.pref_platform,
    preferredGenre: row.pref_genre,
    profilePublic: row.profile_public === 1,
  };
}

const selectByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const selectById = db.prepare('SELECT * FROM users WHERE id = ?');
const insertUser = db.prepare('INSERT INTO users (email, nickname, password_hash, created_at) VALUES (?, ?, ?, ?)');
const selectBySteamId = db.prepare('SELECT * FROM users WHERE steam_id = ?');
const updateSteamIdStmt = db.prepare('UPDATE users SET steam_id = ? WHERE id = ?');
const updateNicknameStmt = db.prepare('UPDATE users SET nickname = ? WHERE id = ?');
const updatePreferencesStmt = db.prepare('UPDATE users SET pref_platform = ?, pref_genre = ? WHERE id = ?');
const updateProfilePublicStmt = db.prepare('UPDATE users SET profile_public = ? WHERE id = ?');
const selectPublicByNickname = db.prepare(
  'SELECT * FROM users WHERE nickname = ? COLLATE NOCASE AND profile_public = 1',
);
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

const isUniqueViolation = (err: unknown) => err instanceof Error && err.message.includes('UNIQUE constraint failed');

/** 공개 중인 계정이 다른 공개 계정과 같은 닉네임으로 바꾸려 하면 409 (주소가 겹치기 때문이다) */
export function updateNickname(id: number, nickname: string): User {
  try {
    updateNicknameStmt.run(nickname, id);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new HttpError(409, '공개된 진열장 중에 같은 닉네임을 쓰는 사람이 있어요. 다른 닉네임을 써 주세요.');
    }
    throw err;
  }
  return toUser(findUserRowById(id)!);
}

/** 진열장을 공개하거나 숨긴다. 다른 공개 계정이 같은 닉네임을 쓰고 있으면 공개할 수 없다(409) */
export function setProfilePublic(id: number, isPublic: boolean): User {
  try {
    updateProfilePublicStmt.run(isPublic ? 1 : 0, id);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new HttpError(
        409,
        '이미 같은 닉네임으로 진열장을 공개한 사람이 있어요. 닉네임을 바꾼 뒤 다시 공개해 주세요.',
      );
    }
    throw err;
  }
  return toUser(findUserRowById(id)!);
}

/** /u/닉네임 주소의 주인. 공개하지 않은 계정은 없는 것과 같다 */
export function findPublicUserRowByNickname(nickname: string): UserRow | undefined {
  return selectPublicByNickname.get(nickname) as UserRow | undefined;
}

export function updatePreferences(id: number, platform: string | null, genre: string | null): User {
  updatePreferencesStmt.run(platform, genre, id);
  return toUser(findUserRowById(id)!);
}

export function updatePasswordHash(id: number, passwordHash: string): void {
  updatePasswordStmt.run(passwordHash, id);
}

/** 세션과 관심 게임은 ON DELETE CASCADE로 함께 지워진다. */
export function deleteUser(id: number): void {
  deleteUserStmt.run(id);
}
