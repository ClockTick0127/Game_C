import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestServer } from './helpers.ts';

let t: Awaited<ReturnType<typeof startTestServer>>;

before(async () => {
  process.env.ALLOWED_ORIGINS = 'https://trusted.example.com/';
  t = await startTestServer();
});
after(() => t.close());

const login = (origin?: string) =>
  fetch(`${t.base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(origin !== undefined && { origin }) },
    body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong-password' }),
  });

describe('Origin 검증', () => {
  // 인증 실패(401)까지 도달했다면 Origin 검사는 통과한 것이다
  it('같은 주소에서 온 요청은 통과한다', async () => {
    assert.equal((await login(t.base)).status, 401);
  });

  it('Origin이 없는 요청(curl 등)은 통과한다', async () => {
    assert.equal((await login()).status, 401);
  });

  it('ALLOWED_ORIGINS에 있는 출처는 통과한다', async () => {
    assert.equal((await login('https://trusted.example.com')).status, 401);
  });

  it('다른 사이트에서 온 상태 변경 요청은 403', async () => {
    const res = await login('https://evil.example.com');
    assert.equal(res.status, 403);
    assert.match((await res.json()).error, /출처/);
  });

  it('해석할 수 없는 출처("null")도 403', async () => {
    assert.equal((await login('null')).status, 403);
  });

  it('포트만 달라도 다른 출처다', async () => {
    assert.equal((await login('http://127.0.0.1:1')).status, 403);
  });

  it('조회(GET) 요청은 Origin과 상관없이 통과한다', async () => {
    const res = await fetch(`${t.base}/api/health`, { headers: { origin: 'https://evil.example.com' } });
    assert.equal(res.status, 200);
  });
});

describe('개발 모드', () => {
  it('Vite 개발 서버(5173) 출처는 기본 허용된다 (프록시가 Host를 바꿔 보내기 때문)', async () => {
    assert.equal((await login('http://localhost:5173')).status, 401);
  });
});
