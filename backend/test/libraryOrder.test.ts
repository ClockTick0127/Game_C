import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestServer } from './helpers.ts';

let t: Awaited<ReturnType<typeof startTestServer>>;

before(async () => {
  t = await startTestServer();
});
after(() => t.close());

let seq = 0;
async function loggedIn() {
  const c = t.client();
  const res = await c.request('POST', '/api/auth/signup', {
    email: `order${++seq}@example.com`,
    password: 'password-1234',
    nickname: '정리왕',
  });
  assert.equal(res.status, 201);
  return c;
}

describe('내 서재 배치', () => {
  it('로그인해야 쓸 수 있다', async () => {
    const c = t.client();
    assert.equal((await c.request('GET', '/api/me/library-order')).status, 401);
    assert.equal((await c.request('PUT', '/api/me/library-order', { order: [1] })).status, 401);
  });

  it('저장한 적이 없으면 빈 배열', async () => {
    const c = await loggedIn();
    assert.deepEqual((await c.request('GET', '/api/me/library-order')).json, { order: [] });
  });

  it('저장한 순서를 그대로 돌려주고, 다시 저장하면 덮어쓴다', async () => {
    const c = await loggedIn();
    assert.equal((await c.request('PUT', '/api/me/library-order', { order: [30, 10, 20] })).status, 204);
    assert.deepEqual((await c.request('GET', '/api/me/library-order')).json.order, [30, 10, 20]);

    await c.request('PUT', '/api/me/library-order', { order: [20, 30] });
    assert.deepEqual((await c.request('GET', '/api/me/library-order')).json.order, [20, 30]);
  });

  it('계정마다 따로 저장된다', async () => {
    const a = await loggedIn();
    const b = await loggedIn();
    await a.request('PUT', '/api/me/library-order', { order: [1, 2, 3] });
    assert.deepEqual((await b.request('GET', '/api/me/library-order')).json.order, []);
  });

  it('잘못된 목록은 400 (배열이 아님, 정수가 아님, 0 이하, 중복)', async () => {
    const c = await loggedIn();
    for (const order of ['abc', null, [1, 'x'], [1.5], [0], [-3], [1, 2, 1], [Number.MAX_SAFE_INTEGER + 2]]) {
      const res = await c.request('PUT', '/api/me/library-order', { order });
      assert.equal(res.status, 400, JSON.stringify(order));
    }
    assert.equal((await c.request('PUT', '/api/me/library-order', {})).status, 400);
    assert.deepEqual((await c.request('GET', '/api/me/library-order')).json.order, []); // 실패한 저장은 반영되지 않는다
  });

  it('일반 요청 한도(20kb)를 넘는 큰 서재도 저장할 수 있다', async () => {
    const c = await loggedIn();
    const order = Array.from({ length: 6000 }, (_, i) => 1_000_000 + i); // 약 50kb
    assert.equal((await c.request('PUT', '/api/me/library-order', { order })).status, 204);
    assert.equal((await c.request('GET', '/api/me/library-order')).json.order.length, 6000);
  });

  it('다른 API는 여전히 20kb를 넘는 본문을 거부한다', async () => {
    const c = await loggedIn();
    const res = await c.request('PATCH', '/api/me', { nickname: 'x'.repeat(30_000) });
    assert.equal(res.status, 413); // 본문이 너무 큼
  });

  it('저장 가능한 개수를 넘으면 400', async () => {
    const c = await loggedIn();
    const order = Array.from({ length: 20_001 }, (_, i) => i + 1);
    assert.equal((await c.request('PUT', '/api/me/library-order', { order })).status, 400);
  });

  it('회원 탈퇴하면 저장한 배치도 함께 지워진다', async () => {
    const c = await loggedIn();
    await c.request('PUT', '/api/me/library-order', { order: [5, 6] });
    const before = (t.db.prepare('SELECT COUNT(*) AS n FROM library_orders').get() as { n: number }).n;
    assert.equal((await c.request('DELETE', '/api/me', { password: 'password-1234' })).status, 204);
    const after = (t.db.prepare('SELECT COUNT(*) AS n FROM library_orders').get() as { n: number }).n;
    assert.equal(after, before - 1);
  });
});
