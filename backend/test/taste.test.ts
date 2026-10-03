import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it, mock } from 'node:test';
import { installFakeFetch, json } from './fakeExternal.ts';
import { startTestServer } from './helpers.ts';

process.env.STEAM_API_KEY = 'test-steam-key';
// 분위기를 알아내는 SteamSpy 조회는 이 파일의 검증 대상이 아니라서 외부 호출이 나가지 않게 끈다
process.env.GAME_STYLES_DISABLED = '1';

let t: Awaited<ReturnType<typeof startTestServer>>;
let fake: ReturnType<typeof installFakeFetch>;
let owned: { appid: number; name: string; playtime_forever: number }[] = [];

before(async () => {
  t = await startTestServer();
  fake = installFakeFetch(t.base, (url) =>
    url.pathname === '/IPlayerService/GetOwnedGames/v1/'
      ? json({ response: { game_count: owned.length, games: owned } })
      : undefined,
  );
});
after(() => {
  fake.restore();
  return t.close();
});
beforeEach(() => {
  mock.method(console, 'warn', () => {});
});

let seq = 0;
/** 가입하고 Steam 계정을 연동한 사용자 (보유 목록은 계정별로 캐시되므로 테스트마다 다른 번호를 쓴다) */
async function linked() {
  const c = t.client();
  const res = await c.request('POST', '/api/auth/signup', {
    email: `taste${++seq}@example.com`,
    password: 'password-1234',
    nickname: '취향러',
  });
  assert.equal(res.status, 201);
  t.db
    .prepare('UPDATE users SET steam_id = ? WHERE id = ?')
    .run(`7656119777000${String(seq).padStart(4, '0')}`, res.json.user.id);
  return { c, userId: res.json.user.id as number };
}

function setPersonas(map: Record<number, string>) {
  const insert = t.db.prepare(
    'INSERT INTO game_styles (appid, persona, checked_at) VALUES (?, ?, 0) ON CONFLICT (appid) DO UPDATE SET persona = excluded.persona',
  );
  for (const [appid, persona] of Object.entries(map)) insert.run(Number(appid), persona);
}

describe('GET /api/me/taste', () => {
  it('로그인해야 쓸 수 있고, Steam을 연동하지 않았으면 404', async () => {
    assert.equal((await t.client().request('GET', '/api/me/taste')).status, 401);
    const c = t.client();
    await c.request('POST', '/api/auth/signup', {
      email: 'taste-none@example.com',
      password: 'password-1234',
      nickname: '미연동',
    });
    assert.equal((await c.request('GET', '/api/me/taste')).status, 404);
  });

  it('분위기를 알아낸 게임이 5개 미만이면 취향을 계산하지 않는다 (ready: false)', async () => {
    owned = [1, 2, 3, 4, 5, 6].map((i) => ({ appid: 7000 + i, name: `G${i}`, playtime_forever: 600 }));
    setPersonas({ 7001: 'scifi', 7002: 'scifi' });
    const { c } = await linked();
    const res = await c.request('GET', '/api/me/taste');
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, { affinity: {}, analyzed: 2, total: 6, ready: false });
  });

  it('플레이 시간·클리어·별점이 높은 분위기일수록 취향이 높다', async () => {
    owned = [
      { appid: 7101, name: 'Horror A', playtime_forever: 6000 },
      { appid: 7102, name: 'Horror B', playtime_forever: 600 },
      { appid: 7103, name: 'Cute A', playtime_forever: 600 },
      { appid: 7104, name: 'Cute B', playtime_forever: 60 },
      { appid: 7105, name: 'Strategy A', playtime_forever: 600 },
      { appid: 7106, name: 'Unknown', playtime_forever: 100 },
    ];
    setPersonas({ 7101: 'horror', 7102: 'horror', 7103: 'cute', 7104: 'cute', 7105: 'strategy' });
    const { c } = await linked();
    await c.request('PUT', '/api/me/game-logs/7101', { status: 'cleared', rating: 5 });
    await c.request('PUT', '/api/me/game-logs/7105', { status: 'dropped', rating: 1 });

    const res = await c.request('GET', '/api/me/taste');
    assert.equal(res.json.ready, true);
    assert.equal(res.json.analyzed, 5);
    assert.equal(res.json.total, 6);
    const a = res.json.affinity as Record<string, number>;
    assert.equal(a.horror, 1);
    assert.ok(a.cute! > 0 && a.cute! < 1);
    assert.equal(a.strategy, 0); // 포기하고 낮은 별점을 준 분위기
  });

  it('다른 사용자의 기록은 섞이지 않는다', async () => {
    owned = [1, 2, 3, 4, 5].map((i) => ({ appid: 7200 + i, name: `G${i}`, playtime_forever: 600 }));
    setPersonas({ 7201: 'scifi', 7202: 'scifi', 7203: 'fantasy', 7204: 'fantasy', 7205: 'fantasy' });
    const a = await linked();
    const b = await linked();
    await a.c.request('PUT', '/api/me/game-logs/7201', { status: 'cleared', rating: 5 });
    await b.c.request('PUT', '/api/me/game-logs/7203', { status: 'cleared', rating: 5 });
    const ra = (await a.c.request('GET', '/api/me/taste')).json.affinity as Record<string, number>;
    const rb = (await b.c.request('GET', '/api/me/taste')).json.affinity as Record<string, number>;
    assert.ok(ra.scifi! > 0.5 && ra.scifi! <= 1);
    assert.ok(rb.fantasy! === 1);
    assert.notDeepEqual(ra, rb);
  });
});
