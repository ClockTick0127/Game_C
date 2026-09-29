import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestServer } from './helpers.ts';

// 요청 제한 상태는 프로세스 메모리에 있으므로, 다른 테스트에 영향을 주지 않도록 파일을 분리했다.
let t: Awaited<ReturnType<typeof startTestServer>>;

before(async () => {
  t = await startTestServer({ rateLimit: true });
});
after(() => t.close());

describe('요청 제한', () => {
  it('로그인 실패가 10번을 넘으면 429', async () => {
    const c = t.client();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await c.request('POST', '/api/auth/login', { email: 'a@example.com', password: 'wrong-password' });
      statuses.push(res.status);
    }
    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
    assert.deepEqual(statuses.slice(10), [429, 429]);

    const blocked = await c.request('POST', '/api/auth/login', { email: 'a@example.com', password: 'wrong-password' });
    assert.match(blocked.json.error, /너무 많습니다/);
    assert.ok(blocked.headers.get('ratelimit') ?? blocked.headers.get('retry-after'));
  });

  it('가입 요청도 한도가 있다', async () => {
    const c = t.client();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await c.request('POST', '/api/auth/signup', {
        email: `u${i}@example.com`,
        password: 'password-1234',
        nickname: '테스터',
      });
      statuses.push(res.status);
    }
    assert.equal(statuses.filter((s) => s === 201).length, 10);
    assert.deepEqual(statuses.slice(10), [429, 429]);
  });

  it('게임 조회는 분당 60회로 제한된다 (외부 API 호출 증폭 방지)', async () => {
    const c = t.client();
    const statuses: number[] = [];
    for (let i = 0; i < 65; i++) statuses.push((await c.request('GET', '/api/games/1/store-info')).status);

    assert.equal(statuses.filter((s) => s === 200).length, 60);
    assert.equal(statuses.filter((s) => s === 429).length, 5);
    assert.match((await c.request('GET', '/api/games/1/store-info')).json.error, /너무 자주/);
    // 게임 조회 제한이 인증 등 다른 API에는 영향을 주지 않는다
    assert.equal((await c.request('GET', '/api/auth/me')).status, 200);
  });
});
