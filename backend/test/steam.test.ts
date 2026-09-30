import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { installFakeFetch, json, type ExternalHandler } from './fakeExternal.ts';
import { startTestServer } from './helpers.ts';

process.env.STEAM_API_KEY = 'test-steam-key';

const STEAM_ID = '76561198000000001';
const OTHER_STEAM_ID = '76561198000000002';
const OP = 'https://steamcommunity.com/openid/login';

let t: Awaited<ReturnType<typeof startTestServer>>;
let fake: ReturnType<typeof installFakeFetch>;
/** Steam의 check_authentication 응답 */
let steamSaysValid = true;

before(async () => {
  t = await startTestServer();
});
after(() => t.close());
beforeEach(() => {
  steamSaysValid = true;
  mock.method(console, 'warn', () => {});
});
afterEach(() => {
  fake?.restore();
  mock.restoreAll();
});

function withExternal(handler?: ExternalHandler) {
  fake = installFakeFetch(t.base, (url, init) => {
    if (url.href === OP && init?.method === 'POST') {
      return new Response(`ns:${'http://specs.openid.net/auth/2.0'}\nis_valid:${steamSaysValid}\n`);
    }
    return handler?.(url, init);
  });
  return fake;
}

/** 리다이렉트를 따라가지 않는 브라우저. 쿠키를 기억한다 */
function browser(initial: Record<string, string> = {}) {
  const jar = new Map(Object.entries(initial));
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  return {
    async get(path: string) {
      const res = await fetch(t.base + path, { redirect: 'manual', headers: { cookie: cookieHeader() } });
      for (const line of res.headers.getSetCookie()) {
        const [key, ...value] = line.split(';')[0]!.split('=');
        // 값이 비어 있으면(clearCookie) 쿠키를 지운 것
        if (value.join('=')) jar.set(key!, value.join('='));
        else jar.delete(key!);
      }
      return { status: res.status, location: res.headers.get('location') ?? '' };
    },
    async api(method: string, path: string, body?: unknown) {
      const c = t.client();
      c.cookie = jar.has('sid') ? `sid=${jar.get('sid')}` : '';
      return c.request(method, path, body);
    },
    has: (name: string) => jar.has(name),
  };
}
type Browser = ReturnType<typeof browser>;

let seq = 0;
/** 가입해서 로그인된 브라우저 */
async function signedUp(): Promise<Browser> {
  const c = t.client();
  await c.request('POST', '/api/auth/signup', {
    email: `steam${++seq}@example.com`,
    password: 'password-1234',
    nickname: '스팀유저',
  });
  return browser({ sid: c.cookie.split('=')[1]! });
}

/** Steam 로그인 페이지로 보낸 주소에서 return_to를 꺼내, Steam이 돌려보내는 응답 주소를 만든다 */
function assertionUrl(steamLocation: string, overrides: Record<string, string> = {}, steamId = STEAM_ID): string {
  const start = new URL(steamLocation);
  assert.equal(start.origin + start.pathname, OP);
  const returnTo = start.searchParams.get('openid.return_to')!;
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': OP,
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${steamId}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${steamId}`,
    'openid.return_to': returnTo,
    'openid.response_nonce': `${new Date().toISOString().slice(0, 19)}Zabcdef`,
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'c2ln',
    ...overrides,
  });
  const callback = new URL(returnTo);
  return `${callback.pathname}?${new URLSearchParams([...callback.searchParams, ...params])}`;
}

describe('Steam 로그인 (OpenID)', () => {
  it('연동하지 않은 상태에서 Steam으로 로그인하면 연동 안내 코드로 돌려보낸다', async () => {
    withExternal();
    const b = browser();
    const start = await b.get('/api/auth/steam?mode=login');
    assert.equal(start.status, 302);

    const back = await b.get(assertionUrl(start.location, {}, OTHER_STEAM_ID));
    assert.equal(back.location, '/login?steam=unlinked');
    assert.equal(b.has('sid'), false);
  });

  it('마이페이지에서 연동한 뒤 Steam으로 로그인하면 그 계정으로 로그인된다', async () => {
    withExternal();
    const owner = await signedUp();

    // 연동 (link)
    const start = await owner.get('/api/auth/steam?mode=link');
    assert.equal(start.status, 302);
    const done = await owner.get(assertionUrl(start.location));
    assert.equal(done.location, '/mypage?steam=linked');
    assert.equal((await owner.api('GET', '/api/auth/me')).json.user.steamId, STEAM_ID);

    // 다른 브라우저에서 Steam으로 로그인 (login)
    const other = browser();
    const loginStart = await other.get('/api/auth/steam?mode=login&redirect=%2Fmypage');
    const loggedIn = await other.get(assertionUrl(loginStart.location));
    assert.equal(loggedIn.location, '/mypage');
    assert.equal(other.has('sid'), true);
    assert.equal((await other.api('GET', '/api/auth/me')).json.user.steamId, STEAM_ID);
  });

  it('Steam이 서명을 인정하지 않으면 실패하고 로그인되지 않는다', async () => {
    withExternal();
    const owner = await signedUp();
    const start = await owner.get('/api/auth/steam?mode=link');

    steamSaysValid = false;
    const done = await owner.get(assertionUrl(start.location));
    assert.equal(done.location, '/mypage?steam=failed');
    assert.equal((await owner.api('GET', '/api/auth/me')).json.user.steamId, null);
  });

  it('다른 주소로 발급된 응답(return_to 불일치)은 Steam에 묻지 않고 거부한다', async () => {
    const f = withExternal();
    const owner = await signedUp();
    const start = await owner.get('/api/auth/steam?mode=link');

    const done = await owner.get(
      assertionUrl(start.location, { 'openid.return_to': 'https://evil.example.com/api/auth/steam/callback' }),
    );
    assert.equal(done.location, '/mypage?steam=failed');
    assert.equal(f.callsTo('steamcommunity.com').length, 0);
  });

  it('claimed_id가 Steam 주소가 아니면 거부한다', async () => {
    withExternal();
    const owner = await signedUp();
    const start = await owner.get('/api/auth/steam?mode=link');
    const forged = 'https://evil.example.com/openid/id/76561198000000009';

    const done = await owner.get(
      assertionUrl(start.location, { 'openid.claimed_id': forged, 'openid.identity': forged }),
    );
    assert.equal(done.location, '/mypage?steam=failed');
  });

  it('서명 대상에 빠진 항목이 있으면 거부한다', async () => {
    withExternal();
    const owner = await signedUp();
    const start = await owner.get('/api/auth/steam?mode=link');

    const done = await owner.get(assertionUrl(start.location, { 'openid.signed': 'signed,op_endpoint,return_to' }));
    assert.equal(done.location, '/mypage?steam=failed');
  });

  it('오래된 응답(nonce 시각이 5분 넘게 지남)은 재사용으로 보고 거부한다', async () => {
    withExternal();
    const owner = await signedUp();
    const start = await owner.get('/api/auth/steam?mode=link');

    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString().slice(0, 19);
    const done = await owner.get(assertionUrl(start.location, { 'openid.response_nonce': `${old}Zabcdef` }));
    assert.equal(done.location, '/mypage?steam=failed');
  });

  it('내가 시작하지 않은 응답(state 쿠키 없음)으로는 연동되지 않는다 (로그인 CSRF 방지)', async () => {
    const f = withExternal();
    const attacker = await signedUp();
    const start = await attacker.get('/api/auth/steam?mode=link');
    const attackerUrl = assertionUrl(start.location, {}, OTHER_STEAM_ID);

    // 피해자는 공격자가 만든 응답 주소를 열게 되지만, 피해자 브라우저에는 해당 state 쿠키가 없다
    const victim = await signedUp();
    const done = await victim.get(attackerUrl);
    assert.equal(done.location, '/login?steam=failed');
    assert.equal(f.callsTo('steamcommunity.com').length, 0);
    assert.equal((await victim.api('GET', '/api/auth/me')).json.user.steamId, null);
  });

  it('이미 다른 계정에 연동된 Steam 계정은 연동할 수 없다', async () => {
    withExternal();
    const first = await signedUp();
    await first.get(assertionUrl((await first.get('/api/auth/steam?mode=link')).location, {}, OTHER_STEAM_ID));

    const second = await signedUp();
    const start = await second.get('/api/auth/steam?mode=link');
    const done = await second.get(assertionUrl(start.location, {}, OTHER_STEAM_ID));
    assert.equal(done.location, '/mypage?steam=taken');
  });

  it('응답은 한 번만 쓸 수 있다 (콜백 뒤 state 쿠키가 지워진다)', async () => {
    withExternal();
    const owner = await signedUp();
    const start = await owner.get('/api/auth/steam?mode=link');
    const url = assertionUrl(start.location, {}, '76561198000000003');

    assert.equal((await owner.get(url)).location, '/mypage?steam=linked');
    // 쿠키가 없어 어떤 흐름이었는지 알 수 없으므로 로그인 화면으로 보낸다
    assert.equal((await owner.get(url)).location, '/login?steam=failed');
  });

  it('연동 없이 link를 시작하면 로그인 페이지로 보낸다', async () => {
    withExternal();
    const res = await browser().get('/api/auth/steam?mode=link');
    assert.equal(res.location, '/login?redirect=%2Fmypage');
  });

  it('redirect에 외부 주소를 넣어도 로그인 후에는 내부 경로로만 이동한다', async () => {
    withExternal();
    const owner = await signedUp();
    await owner.get(assertionUrl((await owner.get('/api/auth/steam?mode=link')).location, {}, '76561198000000004'));

    const b = browser();
    const start = await b.get('/api/auth/steam?mode=login&redirect=%2F%2Fevil.example.com');
    const done = await b.get(assertionUrl(start.location, {}, '76561198000000004'));
    assert.equal(done.location, '/');
  });
});

describe('연동 해제', () => {
  it('해제하면 Steam 로그인은 더 이상 이 계정으로 이어지지 않는다', async () => {
    withExternal();
    const owner = await signedUp();
    await owner.get(assertionUrl((await owner.get('/api/auth/steam?mode=link')).location, {}, '76561198000000005'));

    const res = await owner.api('DELETE', '/api/me/steam');
    assert.equal(res.status, 200);
    assert.equal(res.json.user.steamId, null);

    const b = browser();
    const start = await b.get('/api/auth/steam?mode=login');
    const done = await b.get(assertionUrl(start.location, {}, '76561198000000005'));
    assert.equal(done.location, '/login?steam=unlinked');
  });
});

describe('보유 게임 · 업적', () => {
  async function linked(steamId: string): Promise<Browser> {
    const b = await signedUp();
    await b.get(assertionUrl((await b.get('/api/auth/steam?mode=link')).location, {}, steamId));
    return b;
  }

  it('연동하지 않았으면 404', async () => {
    withExternal();
    const b = await signedUp();
    assert.equal((await b.api('GET', '/api/me/steam/games')).status, 404);
    assert.equal((await b.api('GET', '/api/me/steam/games/10/achievements')).status, 404);
  });

  it('보유 게임을 플레이 시간이 긴 순으로 돌려주고, API 키는 Steam 요청에만 실린다', async () => {
    const f = withExternal((url) =>
      url.pathname === '/IPlayerService/GetOwnedGames/v1/'
        ? json({
            response: {
              game_count: 2,
              games: [
                { appid: 10, name: 'Short', playtime_forever: 30, rtime_last_played: 0, img_icon_url: 'not-a-hash' },
                {
                  appid: 20,
                  name: 'Long',
                  playtime_forever: 600,
                  rtime_last_played: 1_700_000_000,
                  img_icon_url: 'a'.repeat(40),
                },
              ],
            },
          })
        : undefined,
    );
    const b = await linked('76561198000000010');

    const res = await b.api('GET', '/api/me/steam/games');
    assert.equal(res.status, 200);
    assert.equal(res.json.private, false);
    assert.deepEqual(
      res.json.games.map((g: { name: string }) => g.name),
      ['Long', 'Short'],
    );
    assert.equal(res.json.games[0].lastPlayedAt, '2023-11-14T22:13:20.000Z');
    assert.equal(res.json.games[1].lastPlayedAt, null);
    // 정사각형 공식 아이콘: 해시 형식이 올바를 때만 주소를 만든다
    assert.equal(
      res.json.games[0].iconUrl,
      `https://media.steampowered.com/steamcommunity/public/images/apps/20/${'a'.repeat(40)}.jpg`,
    );
    assert.equal(res.json.games[1].iconUrl, null);
    const call = f.callsTo('api.steampowered.com')[0]!;
    assert.equal(call.searchParams.get('steamid'), '76561198000000010');
    assert.equal(call.searchParams.get('key'), 'test-steam-key');
    assert.ok(!JSON.stringify(res.json).includes('test-steam-key'));
  });

  it('게임 세부 정보가 비공개면 private: true (빈 목록과 구분한다)', async () => {
    withExternal((url) => (url.pathname === '/IPlayerService/GetOwnedGames/v1/' ? json({ response: {} }) : undefined));
    const b = await linked('76561198000000011');
    const res = await b.api('GET', '/api/me/steam/games');
    assert.deepEqual(res.json, { private: true, games: [] });
  });

  it('업적은 달성한 것이 먼저, 최근 달성 순으로 돌려준다', async () => {
    withExternal((url) =>
      url.pathname === '/ISteamUserStats/GetPlayerAchievements/v1/'
        ? json({
            playerstats: {
              success: true,
              achievements: [
                { apiname: 'A', achieved: 0, unlocktime: 0, name: '미달성', description: '' },
                { apiname: 'B', achieved: 1, unlocktime: 1_600_000_000, name: '옛 업적', description: '설명' },
                { apiname: 'C', achieved: 1, unlocktime: 1_700_000_000, name: '최근 업적', description: '설명' },
              ],
            },
          })
        : undefined,
    );
    const b = await linked('76561198000000012');
    const res = await b.api('GET', '/api/me/steam/games/440/achievements');
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.json.achievements.map((a: { id: string }) => a.id),
      ['C', 'B', 'A'],
    );
    assert.equal(res.json.achievements[2].unlockedAt, null);
  });

  it('업적이 없는 게임(Steam은 400을 준다)은 supported: false', async () => {
    withExternal((url) =>
      url.pathname === '/ISteamUserStats/GetPlayerAchievements/v1/'
        ? json({ playerstats: { error: 'Requested app has no stats', success: false } }, 400)
        : undefined,
    );
    const b = await linked('76561198000000013');
    const res = await b.api('GET', '/api/me/steam/games/999/achievements');
    assert.equal(res.status, 200);
    assert.equal(res.json.supported, false);
  });

  it('Steam 서버 오류는 502로 알리고 API 키를 노출하지 않는다', async () => {
    withExternal((url) =>
      url.pathname === '/IPlayerService/GetOwnedGames/v1/' ? new Response('down', { status: 503 }) : undefined,
    );
    const b = await linked('76561198000000014');
    const res = await b.api('GET', '/api/me/steam/games');
    assert.equal(res.status, 502);
    assert.ok(!JSON.stringify(res.json).includes('test-steam-key'));
  });

  it('잘못된 게임 ID는 400', async () => {
    withExternal();
    const b = await linked('76561198000000015');
    assert.equal((await b.api('GET', '/api/me/steam/games/abc/achievements')).status, 400);
  });
});
