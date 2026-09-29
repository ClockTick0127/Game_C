import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { sampleGame, startTestServer } from './helpers.ts';

const PASSWORD = 'password-1234';
let t: Awaited<ReturnType<typeof startTestServer>>;

before(async () => {
  t = await startTestServer();
});
after(() => t.close());

const signup = (c: ReturnType<typeof t.client>, email: string, password = PASSWORD) =>
  c.request('POST', '/api/auth/signup', { email, password, nickname: '테스터' });

describe('회원가입 · 로그인 · 로그아웃', () => {
  it('가입하면 바로 로그인 상태가 된다', async () => {
    const c = t.client();
    const res = await signup(c, 'flow@example.com');
    assert.equal(res.status, 201);
    assert.equal(res.json.user.email, 'flow@example.com');
    assert.equal(res.json.user.password_hash, undefined);

    const me = await c.request('GET', '/api/auth/me');
    assert.equal(me.json.user.email, 'flow@example.com');
  });

  it('세션 쿠키는 httpOnly, SameSite=Lax 이다', async () => {
    const res = await signup(t.client(), 'cookie@example.com');
    const setCookie = res.headers.getSetCookie()[0]!;
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
  });

  it('이미 가입된 이메일은 대소문자 무관하게 409', async () => {
    await signup(t.client(), 'dup@example.com');
    assert.equal((await signup(t.client(), 'DUP@example.com')).status, 409);
  });

  it('잘못된 입력은 400', async () => {
    const c = t.client();
    assert.equal((await signup(c, 'not-an-email')).status, 400);
    assert.equal((await signup(c, 'short@example.com', '1234567')).status, 400);
    const shortNick = await c.request('POST', '/api/auth/signup', {
      email: 'x@example.com',
      password: PASSWORD,
      nickname: 'a',
    });
    assert.equal(shortNick.status, 400);
  });

  it('로그인 성공 / 비밀번호 오류 / 없는 이메일', async () => {
    await signup(t.client(), 'login@example.com');

    const ok = t.client();
    assert.equal(
      (await ok.request('POST', '/api/auth/login', { email: 'login@example.com', password: PASSWORD })).status,
      200,
    );
    assert.equal((await ok.request('GET', '/api/auth/me')).json.user.email, 'login@example.com');

    const wrong = await t
      .client()
      .request('POST', '/api/auth/login', { email: 'login@example.com', password: 'wrong-password' });
    const missing = await t
      .client()
      .request('POST', '/api/auth/login', { email: 'nobody@example.com', password: PASSWORD });
    assert.equal(wrong.status, 401);
    assert.equal(missing.status, 401);
    // 가입 여부가 드러나지 않도록 같은 메시지를 쓴다
    assert.equal(wrong.json.error, missing.json.error);
  });

  it('로그아웃하면 세션이 서버에서도 삭제된다', async () => {
    const c = t.client();
    await signup(c, 'logout@example.com');
    const oldCookie = c.cookie;

    assert.equal((await c.request('POST', '/api/auth/logout')).status, 204);
    assert.equal((await c.request('GET', '/api/auth/me')).json.user, null);

    // 예전 쿠키를 다시 써도 이미 삭제된 세션이다
    c.cookie = oldCookie;
    assert.equal((await c.request('GET', '/api/auth/me')).json.user, null);
  });

  it('만료된 세션은 로그인 상태로 취급하지 않는다', async () => {
    const c = t.client();
    await signup(c, 'expired@example.com');
    t.db.prepare('UPDATE sessions SET expires_at = 1').run();
    assert.equal((await c.request('GET', '/api/auth/me')).json.user, null);
    assert.equal((await c.request('GET', '/api/me/favorites')).status, 401);
  });
});

describe('마이페이지', () => {
  it('로그인하지 않으면 401', async () => {
    const c = t.client();
    assert.equal((await c.request('GET', '/api/me/favorites')).status, 401);
    assert.equal((await c.request('PATCH', '/api/me', { nickname: '변경' })).status, 401);
  });

  it('닉네임 수정', async () => {
    const c = t.client();
    await signup(c, 'nick@example.com');
    const res = await c.request('PATCH', '/api/me', { nickname: '새닉네임' });
    assert.equal(res.json.user.nickname, '새닉네임');
  });

  it('비밀번호 변경: 현재 비밀번호 필요, 다른 기기 세션 해제, 새 비밀번호로 로그인', async () => {
    const a = t.client();
    await signup(a, 'pw@example.com');
    const b = t.client();
    await b.request('POST', '/api/auth/login', { email: 'pw@example.com', password: PASSWORD });

    const change = (currentPassword: string, newPassword: string) =>
      a.request('PUT', '/api/me/password', { currentPassword, newPassword });
    assert.equal((await change('wrong-password', 'new-password-1')).status, 400);
    assert.equal((await change(PASSWORD, 'short')).status, 400);
    assert.equal((await change(PASSWORD, 'new-password-1')).status, 204);

    assert.equal((await a.request('GET', '/api/auth/me')).json.user.email, 'pw@example.com');
    assert.equal((await b.request('GET', '/api/auth/me')).json.user, null);

    const old = await t.client().request('POST', '/api/auth/login', { email: 'pw@example.com', password: PASSWORD });
    assert.equal(old.status, 401);
    const fresh = await t
      .client()
      .request('POST', '/api/auth/login', { email: 'pw@example.com', password: 'new-password-1' });
    assert.equal(fresh.status, 200);
  });

  it('관심 게임 추가 · 중복 추가 · 삭제', async () => {
    const c = t.client();
    await signup(c, 'fav@example.com');

    assert.equal((await c.request('PUT', '/api/me/favorites/1', sampleGame(1))).status, 204);
    assert.equal((await c.request('PUT', '/api/me/favorites/1', sampleGame(1))).status, 204);
    await c.request('PUT', '/api/me/favorites/2', sampleGame(2));
    assert.equal((await c.request('GET', '/api/me/favorites')).json.games.length, 2);

    assert.equal((await c.request('DELETE', '/api/me/favorites/1')).status, 204);
    const list = (await c.request('GET', '/api/me/favorites')).json.games as { id: number }[];
    assert.deepEqual(
      list.map((g) => g.id),
      [2],
    );
  });

  it('관심 게임 입력 검증: ID 불일치, http/javascript URL 거부', async () => {
    const c = t.client();
    await signup(c, 'favbad@example.com');
    assert.equal((await c.request('PUT', '/api/me/favorites/3', sampleGame(4))).status, 400);
    assert.equal(
      (await c.request('PUT', '/api/me/favorites/5', { ...sampleGame(5), url: 'javascript:alert(1)' })).status,
      400,
    );
    assert.equal(
      (await c.request('PUT', '/api/me/favorites/6', { ...sampleGame(6), image: 'http://example.com/a.jpg' })).status,
      400,
    );
    assert.equal((await c.request('PUT', '/api/me/favorites/abc', sampleGame(7))).status, 400);
  });

  it('관심 게임은 사용자별로 분리된다', async () => {
    const a = t.client();
    const b = t.client();
    await signup(a, 'iso-a@example.com');
    await signup(b, 'iso-b@example.com');
    await a.request('PUT', '/api/me/favorites/10', sampleGame(10));
    assert.equal((await b.request('GET', '/api/me/favorites')).json.games.length, 0);
  });

  it('회원 탈퇴: 비밀번호 확인, 관심 게임 삭제, 재로그인 불가', async () => {
    const c = t.client();
    await signup(c, 'bye@example.com');
    await c.request('PUT', '/api/me/favorites/20', sampleGame(20));

    assert.equal((await c.request('DELETE', '/api/me', { password: 'wrong-password' })).status, 400);
    assert.equal((await c.request('DELETE', '/api/me', { password: PASSWORD })).status, 204);

    const counts = t.db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM users WHERE email = 'bye@example.com') AS users,
                (SELECT COUNT(*) FROM favorites WHERE game_id = 20) AS favorites`,
      )
      .get() as { users: number; favorites: number };
    assert.deepEqual({ ...counts }, { users: 0, favorites: 0 });

    const res = await t.client().request('POST', '/api/auth/login', { email: 'bye@example.com', password: PASSWORD });
    assert.equal(res.status, 401);
  });
});

describe('공통', () => {
  it('보안 헤더가 붙고 X-Powered-By는 없다', async () => {
    const res = await t.client().request('GET', '/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(res.headers.get('content-security-policy'));
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  it('없는 API는 404, 깨진 JSON 본문은 400', async () => {
    assert.equal((await t.client().request('GET', '/api/nope')).status, 404);

    const res = await fetch(`${t.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    assert.equal(res.status, 400);
  });
});

describe('만료 세션 정리', () => {
  it('만료된 세션만 삭제하고 유효한 세션은 유지한다', async () => {
    const { purgeExpiredSessions } = await import('../src/services/sessions.ts');
    purgeExpiredSessions(); // 앞선 테스트가 남긴 만료 세션을 먼저 비운다
    const alive = t.client();
    await signup(alive, 'purge-alive@example.com');
    const gone = t.client();
    await signup(gone, 'purge-gone@example.com');

    // 두 번째 사용자의 세션만 만료시킨다
    t.db
      .prepare('UPDATE sessions SET expires_at = 1 WHERE user_id = (SELECT id FROM users WHERE email = ?)')
      .run('purge-gone@example.com');

    const before = (t.db.prepare('SELECT COUNT(*) AS c FROM sessions').get() as { c: number }).c;
    const removed = purgeExpiredSessions();
    const after = (t.db.prepare('SELECT COUNT(*) AS c FROM sessions').get() as { c: number }).c;

    assert.equal(removed, 1);
    assert.equal(after, before - 1);
    assert.equal((await alive.request('GET', '/api/auth/me')).json.user.email, 'purge-alive@example.com');
    assert.equal((await gone.request('GET', '/api/auth/me')).json.user, null);
    assert.equal(purgeExpiredSessions(), 0);
  });
});

describe('모든 기기에서 로그아웃', () => {
  it('모든 기기의 세션을 지우고 다른 사용자는 건드리지 않는다', async () => {
    const a1 = t.client();
    await signup(a1, 'all-a@example.com');
    const a2 = t.client();
    await a2.request('POST', '/api/auth/login', { email: 'all-a@example.com', password: PASSWORD });
    const other = t.client();
    await signup(other, 'all-other@example.com');

    assert.equal((await a1.request('POST', '/api/auth/logout-all')).status, 204);

    assert.equal((await a1.request('GET', '/api/auth/me')).json.user, null);
    assert.equal((await a2.request('GET', '/api/auth/me')).json.user, null);
    assert.equal((await other.request('GET', '/api/auth/me')).json.user.email, 'all-other@example.com');

    // 계정은 그대로라 다시 로그인할 수 있다
    const again = await t
      .client()
      .request('POST', '/api/auth/login', { email: 'all-a@example.com', password: PASSWORD });
    assert.equal(again.status, 200);
  });

  it('로그인하지 않으면 401', async () => {
    assert.equal((await t.client().request('POST', '/api/auth/logout-all')).status, 401);
  });
});
