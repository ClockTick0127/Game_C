import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { installFakeFetch, json, type ExternalHandler } from './fakeExternal.ts';
import { startTestServer } from './helpers.ts';

process.env.STEAM_API_KEY = 'test-steam-key';
process.env.POPULAR_GAP_MS = '0';

let t: Awaited<ReturnType<typeof startTestServer>>;
let fake: ReturnType<typeof installFakeFetch>;

const OWNED = {
  response: {
    game_count: 3,
    games: [1, 2, 3].map((appid) => ({ appid, name: `G${appid}`, playtime_forever: 10 - appid })),
  },
};

// SteamSpy가 호출 제한(429)을 건다
const handler: ExternalHandler = (url) => {
  if (url.pathname === '/IPlayerService/GetOwnedGames/v1/') return json(OWNED);
  if (url.host === 'steamspy.com') return new Response('slow down', { status: 429 });
  return undefined;
};

before(async () => {
  t = await startTestServer();
});
after(() => t.close());
beforeEach(() => {
  mock.method(console, 'warn', () => {});
  fake = installFakeFetch(t.base, handler);
});
afterEach(() => {
  fake.restore();
  mock.restoreAll();
});

describe('게임 분위기 — SteamSpy 호출 제한', () => {
  it('게임 목록은 정상으로 내려주고, 첫 실패에서 멈춰 계속 두드리지 않는다', async () => {
    const c = t.client();
    await c.request('POST', '/api/auth/signup', {
      email: 'limit@example.com',
      password: 'password-1234',
      nickname: '제한',
    });
    t.db.prepare("UPDATE users SET steam_id = '76561198000000098' WHERE email = 'limit@example.com'").run();
    const login = t.client();
    await login.request('POST', '/api/auth/login', { email: 'limit@example.com', password: 'password-1234' });

    const first = await login.request('GET', '/api/me/steam/games');
    assert.equal(first.status, 200);
    assert.equal(first.json.games.length, 3);

    const { whenStylesIdle } = await import('../src/services/gameStyle.ts');
    await whenStylesIdle();
    assert.equal(fake.callsTo('steamspy.com').length, 1); // 429를 받은 뒤 나머지는 부르지 않는다

    const second = await login.request('GET', '/api/me/steam/games');
    assert.equal(second.json.stylesPending, 3); // 알아내지 못한 게임은 그대로 대기 중
    assert.ok(second.json.games.every((g: { persona: string | null }) => g.persona === null));

    // 실패한 직후에는 요청이 와도 다시 시도하지 않는다 (10분 대기)
    await whenStylesIdle();
    assert.equal(fake.callsTo('steamspy.com').length, 1);
  });
});
