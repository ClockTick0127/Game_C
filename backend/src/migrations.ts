import type { DatabaseSync } from 'node:sqlite';

export interface Migration {
  /** 1부터 연속된 번호. 이미 배포된 마이그레이션은 절대 수정하지 말고 새 번호를 추가한다. */
  version: number;
  description: string;
  sql: string;
}

/**
 * 스키마 변경 이력. DB 파일의 `PRAGMA user_version`에 마지막으로 적용한 번호를 기록한다.
 * 스키마를 바꿀 때는 이 배열 끝에 항목을 추가하면, 서버가 시작될 때 아직 적용되지 않은 것만 순서대로 실행된다.
 */
export const migrations: Migration[] = [
  {
    version: 1,
    description: '초기 스키마 (users, sessions, favorites)',
    // IF NOT EXISTS: 마이그레이션 도입 전에 만들어진 DB(user_version 0)도 그대로 1번으로 취급한다
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
        nickname      TEXT    NOT NULL,
        password_hash TEXT    NOT NULL,
        created_at    TEXT    NOT NULL
      );

      -- 토큰 원문은 쿠키에만 있고 DB에는 해시만 저장한다
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT    PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );

      -- 관심 게임. 목록을 보여줄 때 외부 API를 다시 부르지 않도록 게임 정보를 JSON으로 함께 저장한다
      CREATE TABLE IF NOT EXISTS favorites (
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        game_id    INTEGER NOT NULL,
        released   TEXT    NOT NULL,
        game       TEXT    NOT NULL,
        created_at TEXT    NOT NULL,
        PRIMARY KEY (user_id, game_id)
      );
    `,
  },
  {
    version: 2,
    description: '세션 조회 인덱스 (다른 기기 로그아웃, 만료 세션 정리)',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    `,
  },
];

function currentVersion(db: DatabaseSync): number {
  return (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
}

/**
 * 아직 적용되지 않은 마이그레이션을 순서대로 실행하고 적용한 개수를 돌려준다.
 * 각 마이그레이션은 트랜잭션 하나로 실행되므로 중간에 실패하면 그 단계는 반영되지 않는다.
 */
export function runMigrations(db: DatabaseSync, list: Migration[] = migrations): number {
  list.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error(`마이그레이션 번호가 1부터 연속되어야 합니다: ${m.version}`);
  });

  const start = currentVersion(db);
  const latest = list.length;
  if (start > latest) {
    // 새 버전 서버가 올려둔 DB를 옛 버전 코드로 열면 스키마가 맞지 않아 데이터가 깨질 수 있다
    throw new Error(`DB 스키마 버전(${start})이 이 서버가 아는 최신 버전(${latest})보다 높습니다. 서버를 최신 버전으로 업데이트하세요.`);
  }

  let applied = 0;
  for (const m of list.slice(start)) {
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      // PRAGMA는 바인딩 파라미터를 쓸 수 없어 숫자만 문자열로 넣는다
      db.exec(`PRAGMA user_version = ${m.version}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`마이그레이션 ${m.version}번(${m.description}) 실패: ${(err as Error).message}`, { cause: err });
    }
    applied++;
  }
  return applied;
}
