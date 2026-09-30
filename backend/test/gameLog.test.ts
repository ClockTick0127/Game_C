import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestServer } from './helpers.ts';

let t: Awaited<ReturnType<typeof startTestServer>>;
let MAX_GAME_LOGS: number;
let MAX_NOTE_LENGTH: number;

before(async () => {
  t = await startTestServer();
  // db.ts가 import 시점에 DB_PATH를 읽는다. 서버를 띄우기 전에 서비스를 불러오면 임시 DB가 아니라 개발용 DB에 붙는다.
  ({ MAX_GAME_LOGS, MAX_NOTE_LENGTH } = await import('../src/services/gameLog.ts'));
});
after(() => t.close());

let seq = 0;
async function loggedIn() {
  const c = t.client();
  const res = await c.request('POST', '/api/auth/signup', {
    email: `gamelog${++seq}@example.com`,
    password: 'password-1234',
    nickname: '기록가',
  });
  assert.equal(res.status, 201);
  return { c, userId: res.json.user.id as number };
}

const logs = async (c: Awaited<ReturnType<typeof loggedIn>>['c']) =>
  (await c.request('GET', '/api/me/game-logs')).json.logs;

describe('게임별 플레이 상태·별점·메모', () => {
  it('로그인해야 쓸 수 있다', async () => {
    const c = t.client();
    assert.equal((await c.request('GET', '/api/me/game-logs')).status, 401);
    assert.equal((await c.request('PUT', '/api/me/game-logs/1', { status: 'playing' })).status, 401);
    assert.equal((await c.request('DELETE', '/api/me/game-logs/1')).status, 401);
  });

  it('남기면 목록에 나오고, 다시 남기면 통째로 덮어쓰며, 지울 수 있다', async () => {
    const { c } = await loggedIn();
    assert.deepEqual(await logs(c), []);

    const first = { status: 'playing', rating: 4, note: '보스가 어렵다' };
    assert.equal((await c.request('PUT', '/api/me/game-logs/440', first)).status, 204);
    assert.deepEqual(await logs(c), [{ gameId: 440, ...first }]);

    // 덮어쓰기: 본문에 없는 칸은 비운 것이 된다
    assert.equal((await c.request('PUT', '/api/me/game-logs/440', { status: 'cleared' })).status, 204);
    assert.deepEqual(await logs(c), [{ gameId: 440, status: 'cleared', rating: null, note: '' }]);

    assert.equal((await c.request('DELETE', '/api/me/game-logs/440')).status, 204);
    assert.deepEqual(await logs(c), []);
  });

  it('게임 번호 순으로 돌려주고, 서재 번호(직접 추가한 게임은 10억 이상)도 그대로 저장한다', async () => {
    const { c } = await loggedIn();
    await c.request('PUT', '/api/me/game-logs/1000003498', { rating: 5 });
    await c.request('PUT', '/api/me/game-logs/730', { status: 'backlog' });
    assert.deepEqual(
      (await logs(c)).map((l: { gameId: number }) => l.gameId),
      [730, 1000003498],
    );
  });

  it('별점만, 메모만 남겨도 되고 메모는 앞뒤 공백을 자른다', async () => {
    const { c } = await loggedIn();
    await c.request('PUT', '/api/me/game-logs/1', { rating: 3 });
    await c.request('PUT', '/api/me/game-logs/2', { note: '  다시 해보고 싶다  ' });
    assert.deepEqual(await logs(c), [
      { gameId: 1, status: null, rating: 3, note: '' },
      { gameId: 2, status: null, rating: null, note: '다시 해보고 싶다' },
    ]);
  });

  it('세 칸을 모두 비워 보내면 기록이 지워진다', async () => {
    const { c } = await loggedIn();
    await c.request('PUT', '/api/me/game-logs/1', { status: 'dropped', rating: 1, note: '별로' });
    assert.equal(
      (await c.request('PUT', '/api/me/game-logs/1', { status: null, rating: null, note: '  ' })).status,
      204,
    );
    assert.deepEqual(await logs(c), []);
    // 처음부터 비어 있어도 행을 만들지 않는다
    assert.equal((await c.request('PUT', '/api/me/game-logs/2', {})).status, 204);
    assert.deepEqual(await logs(c), []);
  });

  it('계정마다 따로 저장된다', async () => {
    const a = await loggedIn();
    const b = await loggedIn();
    await a.c.request('PUT', '/api/me/game-logs/1', { status: 'cleared', rating: 5 });
    assert.deepEqual(await logs(b.c), []);
    await b.c.request('DELETE', '/api/me/game-logs/1');
    assert.equal((await logs(a.c)).length, 1);
  });

  it('잘못된 값은 400', async () => {
    const { c } = await loggedIn();
    const put = (body: unknown, id = '1') => c.request('PUT', `/api/me/game-logs/${id}`, body);

    assert.equal((await put({ status: 'finished' })).status, 400);
    assert.equal((await put({ status: 1 })).status, 400);
    for (const rating of [0, 6, -1, 2.5, '3', true]) {
      assert.equal((await put({ rating })).status, 400, `별점 ${String(rating)}`);
    }
    assert.equal((await put({ note: 123 })).status, 400);
    assert.equal((await put({ note: 'a'.repeat(MAX_NOTE_LENGTH + 1) })).status, 400);
    assert.equal((await put({ note: 'a'.repeat(MAX_NOTE_LENGTH) })).status, 204);

    for (const id of ['0', '-1', 'abc', '1.5']) {
      assert.equal((await put({ status: 'playing' }, id)).status, 400, `게임 번호 ${id}`);
      assert.equal((await c.request('DELETE', `/api/me/game-logs/${id}`)).status, 400, `삭제 ${id}`);
    }
  });

  it('객체가 아닌 본문도 오류 없이 처리한다 (null은 JSON 파서가 400, 배열은 빈 기록)', async () => {
    const { c } = await loggedIn();
    assert.equal((await c.request('PUT', '/api/me/game-logs/1', null)).status, 400);
    assert.equal((await c.request('PUT', '/api/me/game-logs/1', [])).status, 204);
    assert.deepEqual(await logs(c), []);
  });

  it('남길 수 있는 게임 수에 한도가 있다 (이미 남긴 게임은 한도 뒤에도 고칠 수 있다)', async () => {
    const { c, userId } = await loggedIn();
    t.db.exec('BEGIN');
    const insert = t.db.prepare(
      "INSERT INTO game_logs (user_id, game_id, status, note, updated_at) VALUES (?, ?, 'backlog', '', '2026-01-01')",
    );
    for (let id = 1; id <= MAX_GAME_LOGS; id++) insert.run(userId, id);
    t.db.exec('COMMIT');

    assert.equal((await c.request('PUT', `/api/me/game-logs/${MAX_GAME_LOGS + 1}`, { status: 'playing' })).status, 400);
    assert.equal((await c.request('PUT', '/api/me/game-logs/1', { status: 'cleared' })).status, 204);
    // 하나 지우면 새 게임을 다시 남길 수 있다
    await c.request('DELETE', '/api/me/game-logs/2');
    assert.equal((await c.request('PUT', `/api/me/game-logs/${MAX_GAME_LOGS + 1}`, { status: 'playing' })).status, 204);
  });

  it('계정을 탈퇴하면 기록도 함께 지워진다', async () => {
    const { c, userId } = await loggedIn();
    await c.request('PUT', '/api/me/game-logs/1', { status: 'playing' });
    assert.equal((await c.request('DELETE', '/api/me', { password: 'password-1234' })).status, 204);
    const row = t.db.prepare('SELECT COUNT(*) AS count FROM game_logs WHERE user_id = ?').get(userId) as {
      count: number;
    };
    assert.equal(row.count, 0);
  });
});
