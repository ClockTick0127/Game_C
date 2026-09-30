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
  {
    version: 3,
    description: '캘린더 구독(ICS) 주소용 토큰',
    // 구독 주소는 로그인 없이 열려야 해서(캘린더 앱은 쿠키가 없다) 추측할 수 없는 토큰 자체가 열쇠다.
    // 설정 화면에 주소를 다시 보여줘야 하므로 세션과 달리 원문을 저장한다.
    sql: `
      ALTER TABLE users ADD COLUMN calendar_token TEXT;
      CREATE UNIQUE INDEX idx_users_calendar_token ON users(calendar_token);
    `,
  },
  {
    version: 4,
    description: 'Steam 계정 연동 (OpenID 로그인)',
    // SteamID64(17자리)는 JS 숫자로 다루면 정밀도를 잃을 수 있어 문자열로 저장한다. 한 Steam 계정은 한 사용자에게만 연결된다.
    sql: `
      ALTER TABLE users ADD COLUMN steam_id TEXT;
      CREATE UNIQUE INDEX idx_users_steam_id ON users(steam_id);
    `,
  },
  {
    version: 5,
    description: '인기 게임 (SteamSpy 보유자 수 추정치 + Steam 스토어 출시 정보)',
    // SteamSpy는 보유자 수를 구간(예: 1,000,000 ~ 2,000,000)으로만 준다. 출시 연도·플랫폼은 SteamSpy에 없어서
    // Steam 스토어에서 게임마다 따로 받아 채우며, release_checked=1이면 이미 조회를 마친 것이다(없는 앱 포함).
    sql: `
      CREATE TABLE popular_games (
        appid           INTEGER PRIMARY KEY,
        name            TEXT    NOT NULL,
        developer       TEXT    NOT NULL DEFAULT '',
        publisher       TEXT    NOT NULL DEFAULT '',
        owners_min      INTEGER NOT NULL,
        owners_max      INTEGER NOT NULL,
        ccu             INTEGER NOT NULL DEFAULT 0,
        price_cents     INTEGER,
        discount        INTEGER NOT NULL DEFAULT 0,
        genres          TEXT    NOT NULL DEFAULT '[]',
        release_year    INTEGER,
        windows         INTEGER,
        mac             INTEGER,
        linux           INTEGER,
        release_checked INTEGER NOT NULL DEFAULT 0,
        crawled_at      INTEGER NOT NULL
      );
      CREATE INDEX idx_popular_owners ON popular_games(owners_min DESC, ccu DESC);
    `,
  },
  {
    version: 6,
    description: '내 서재 게임 배치(사용자가 직접 정한 순서)',
    // 순서는 통째로 읽고 통째로 저장하므로 앱 번호 목록을 JSON 한 덩어리로 둔다
    sql: `
      CREATE TABLE library_orders (
        user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        order_json TEXT    NOT NULL,
        updated_at TEXT    NOT NULL
      );
    `,
  },
  {
    version: 7,
    description: '게임 분위기(서재 책등 폰트 선택용, SteamSpy 태그 기반)',
    // 태그는 잘 바뀌지 않고 조회가 느려서(초당 1회 제한) 한 번 알아낸 결과를 계속 쓴다
    sql: `
      CREATE TABLE game_styles (
        appid      INTEGER PRIMARY KEY,
        persona    TEXT    NOT NULL,
        checked_at INTEGER NOT NULL
      );
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
    throw new Error(
      `DB 스키마 버전(${start})이 이 서버가 아는 최신 버전(${latest})보다 높습니다. 서버를 최신 버전으로 업데이트하세요.`,
    );
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
