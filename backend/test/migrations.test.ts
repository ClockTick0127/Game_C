import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { migrations, runMigrations } from '../src/migrations.ts';

const version = (db: DatabaseSync) =>
  (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
const tables = (db: DatabaseSync) =>
  (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all() as { name: string }[]
  ).map((r) => r.name);
const indexes = (db: DatabaseSync) =>
  (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name").all() as {
      name: string;
    }[]
  ).map((r) => r.name);

describe('DB 마이그레이션', () => {
  it('새 DB는 모든 마이그레이션을 적용해 최신 버전이 된다', () => {
    const db = new DatabaseSync(':memory:');
    assert.equal(runMigrations(db), migrations.length);
    assert.equal(version(db), migrations.length);
    assert.deepEqual(tables(db), [
      'custom_library_games',
      'favorites',
      'game_logs',
      'game_styles',
      'library_orders',
      'popular_games',
      'sessions',
      'steam_rawg_matches',
      'users',
    ]);
    assert.deepEqual(indexes(db), [
      'idx_popular_owners',
      'idx_sessions_expires_at',
      'idx_sessions_user_id',
      'idx_users_calendar_token',
      'idx_users_steam_id',
    ]);
  });

  it('다시 실행해도 아무것도 적용하지 않는다', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    assert.equal(runMigrations(db), 0);
  });

  it('마이그레이션 도입 전에 만들어진 DB(버전 0)도 데이터를 유지한 채 업그레이드된다', () => {
    const db = new DatabaseSync(':memory:');
    // 예전 db.ts가 만들던 스키마 그대로
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        nickname TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE favorites (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        game_id INTEGER NOT NULL,
        released TEXT NOT NULL,
        game TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, game_id)
      );
      INSERT INTO users (email, nickname, password_hash, created_at) VALUES ('old@example.com', '기존회원', 'hash', '2026-01-01');
    `);
    assert.equal(version(db), 0);

    assert.equal(runMigrations(db), migrations.length);
    assert.equal(version(db), migrations.length);
    const user = db.prepare('SELECT nickname FROM users WHERE email = ?').get('old@example.com') as {
      nickname: string;
    };
    assert.equal(user.nickname, '기존회원');
    assert.equal(indexes(db).length, 5);
  });

  it('중간 단계가 실패하면 그 단계만 되돌리고 이전 버전에 머문다', () => {
    const db = new DatabaseSync(':memory:');
    const broken = [
      migrations[0]!,
      { version: 2, description: '실패하는 변경', sql: 'CREATE TABLE half_done (id INTEGER); THIS IS NOT SQL;' },
    ];
    assert.throws(() => runMigrations(db, broken), /마이그레이션 2번.*실패/);
    assert.equal(version(db), 1);
    assert.ok(!tables(db).includes('half_done'));
  });

  it('DB가 서버보다 새 버전이면 시작을 거부한다', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`PRAGMA user_version = ${migrations.length + 1}`);
    assert.throws(() => runMigrations(db), /최신 버전으로 업데이트/);
  });

  it('번호가 연속되지 않으면 거부한다', () => {
    const db = new DatabaseSync(':memory:');
    assert.throws(() => runMigrations(db, [{ ...migrations[0]!, version: 2 }]), /연속/);
  });
});
