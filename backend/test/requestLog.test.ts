import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it, mock } from 'node:test';
import { startTestServer } from './helpers.ts';

let t: Awaited<ReturnType<typeof startTestServer>>;
let log: ReturnType<typeof mock.method>;

before(async () => {
  t = await startTestServer({ logRequests: true });
});
after(() => t.close());
beforeEach(() => {
  mock.restoreAll();
  log = mock.method(console, 'log', () => {});
});

const get = (path: string, headers: Record<string, string> = {}) => fetch(t.base + path, { headers });
/** 응답이 끝난 뒤에 남는 로그까지 잡히도록 한 틱 기다린다 */
const lines = async () => {
  await new Promise((r) => setTimeout(r, 20));
  return log.mock.calls.map((c) => String(c.arguments[0]));
};

describe('요청 ID', () => {
  it('모든 응답에 X-Request-Id가 붙고, 요청마다 다르다', async () => {
    const a = (await get('/api/health')).headers.get('x-request-id');
    const b = (await get('/api/health')).headers.get('x-request-id');
    assert.match(a!, /^[0-9a-f-]{36}$/);
    assert.notEqual(a, b);
  });

  it('요청 제한이나 404처럼 일찍 끝난 응답에도 붙는다', async () => {
    assert.ok((await get('/api/nope')).headers.get('x-request-id'));
  });

  it('프록시가 보낸 올바른 형식의 ID는 이어받는다', async () => {
    const res = await get('/api/health', { 'X-Request-Id': 'proxy-abc-12345' });
    assert.equal(res.headers.get('x-request-id'), 'proxy-abc-12345');
  });

  it('형식이 이상한 ID는 버리고 새로 만든다 (로그 오염 방지)', async () => {
    for (const bad of ['abc', '<script>alert(1)</script>', 'has space in it 123', 'x'.repeat(65)]) {
      const id = (await get('/api/health', { 'X-Request-Id': bad })).headers.get('x-request-id');
      assert.notEqual(id, bad);
      assert.match(id!, /^[0-9a-f-]{36}$/);
    }
  });
});

describe('요청 로그', () => {
  it('요청 ID, 메서드, 경로, 상태 코드, 걸린 시간을 한 줄로 남긴다', async () => {
    const res = await get('/api/nope');
    const id = res.headers.get('x-request-id')!;
    const found = (await lines()).filter((l) => l.startsWith(id));
    assert.equal(found.length, 1);
    assert.match(found[0]!, new RegExp(`^${id} GET /api/nope 404 \\d+ms$`));
  });

  it('쿼리 문자열은 기록하지 않는다 (검색어·날짜에 개인정보가 섞일 수 있다)', async () => {
    await get('/api/nope?token=SECRET-VALUE&name=private');
    const all = (await lines()).join('\n');
    assert.match(all, /GET \/api\/nope 404/);
    assert.doesNotMatch(all, /SECRET-VALUE|private|token=/);
  });

  it('요청 본문과 쿠키도 기록하지 않는다', async () => {
    const c = t.client();
    await c.request('POST', '/api/auth/signup', {
      email: 'log@example.com',
      password: 'password-1234',
      nickname: '로그',
    });
    await c.request('POST', '/api/auth/login', { email: 'log@example.com', password: 'wrong-password-xyz' });
    const all = (await lines()).join('\n');
    assert.match(all, /POST \/api\/auth\/login 401/);
    assert.doesNotMatch(all, /password|wrong-password-xyz|log@example\.com|sid=/);
  });

  it('로그인한 사용자는 사용자 번호를 함께 남긴다', async () => {
    const c = t.client();
    await c.request('POST', '/api/auth/signup', {
      email: 'log2@example.com',
      password: 'password-1234',
      nickname: '로그2',
    });
    log.mock.resetCalls();
    const res = await c.request('GET', '/api/auth/me');
    const id = res.headers.get('x-request-id')!;
    const found = (await lines()).find((l) => l.startsWith(id))!;
    assert.match(found, / user=\d+$/);
  });

  it('상태 확인(/api/health)은 로그를 남기지 않는다', async () => {
    await get('/api/health');
    assert.deepEqual(await lines(), []);
  });

  it('API가 아닌 경로(화면 자원)는 로그를 남기지 않는다', async () => {
    await get('/some-page.js');
    assert.deepEqual(await lines(), []);
  });
});
