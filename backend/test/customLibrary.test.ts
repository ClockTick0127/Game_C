import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it, mock } from 'node:test';
import { installFakeFetch, json } from './fakeExternal.ts';
import { startTestServer } from './helpers.ts';

process.env.STEAM_API_KEY = 'test-steam-key';

let t: Awaited<ReturnType<typeof startTestServer>>;

let fake: ReturnType<typeof installFakeFetch>;
/** Steam이 알려 주는 보유 게임 이름. 응답 코드가 200이 아니면 Steam 장애를 흉내 낸다 */
let steamOwned: string[] = [];
let steamStatus = 200;

before(async () => {
  t = await startTestServer();
  // Steam 스토어 검색: 이름이 정확히 같은 앱만 인정한다
  fake = installFakeFetch(t.base, (url) => {
    if (url.pathname === '/IPlayerService/GetOwnedGames/v1/') {
      if (steamStatus !== 200) return new Response('down', { status: steamStatus });
      return json({
        response: {
          game_count: steamOwned.length,
          games: steamOwned.map((name, i) => ({ appid: 100 + i, name, playtime_forever: 10 })),
        },
      });
    }
    return url.host === 'store.steampowered.com'
      ? json({ items: [{ id: 271590, name: 'Grand Theft Auto V', type: 'app' }] })
      : undefined;
  });
});
after(() => {
  fake.restore();
  return t.close();
});

let seq = 0;
async function loggedIn() {
  const c = t.client();
  const res = await c.request('POST', '/api/auth/signup', {
    email: `custom${++seq}@example.com`,
    password: 'password-1234',
    nickname: '수집가',
  });
  assert.equal(res.status, 201);
  return c;
}

const game = { id: 3498, name: 'Grand Theft Auto V', image: 'https://media.rawg.io/media/games/a.jpg' };

describe('서재에 직접 추가한 게임', () => {
  it('로그인해야 쓸 수 있다', async () => {
    const c = t.client();
    assert.equal((await c.request('GET', '/api/me/library-games')).status, 401);
  });

  it('추가하면 목록에 나오고, 다시 추가해도 하나뿐이며, 지울 수 있다', async () => {
    const c = await loggedIn();
    assert.deepEqual((await c.request('GET', '/api/me/library-games')).json, { games: [] });
    assert.equal((await c.request('PUT', '/api/me/library-games/3498', game)).status, 204);
    assert.equal((await c.request('PUT', '/api/me/library-games/3498', game)).status, 204);
    assert.deepEqual((await c.request('GET', '/api/me/library-games')).json.games, [{ ...game, steamAppId: 271590 }]);
    assert.equal((await c.request('DELETE', '/api/me/library-games/3498')).status, 204);
    assert.deepEqual((await c.request('GET', '/api/me/library-games')).json.games, []);
  });

  it('계정마다 따로 저장된다', async () => {
    const a = await loggedIn();
    const b = await loggedIn();
    await a.request('PUT', '/api/me/library-games/3498', game);
    assert.deepEqual((await b.request('GET', '/api/me/library-games')).json.games, []);
  });

  it('잘못된 본문은 400 (번호 불일치, 이름 없음), https가 아닌 표지는 버린다', async () => {
    const c = await loggedIn();
    assert.equal((await c.request('PUT', '/api/me/library-games/1', game)).status, 400);
    assert.equal((await c.request('PUT', '/api/me/library-games/3498', { ...game, name: ' ' })).status, 400);
    await c.request('PUT', '/api/me/library-games/3498', { ...game, image: 'javascript:alert(1)' });
    assert.equal((await c.request('GET', '/api/me/library-games')).json.games[0].image, null);
  });

  it('검색어가 없으면 400', async () => {
    const c = await loggedIn();
    assert.equal((await c.request('GET', '/api/me/library-games/search?q=')).status, 400);
  });
});

describe('Steam으로 이미 가진 게임은 직접 추가할 수 없다', () => {
  let steamSeq = 0;
  /** Steam 계정을 연동한 사용자 (Steam 보유 목록은 계정별로 캐시되므로 테스트마다 다른 번호를 쓴다) */
  async function linked() {
    const c = await loggedIn();
    const me = (await c.request('GET', '/api/auth/me')).json.user;
    t.db
      .prepare('UPDATE users SET steam_id = ? WHERE id = ?')
      .run(`7656119900000${String(++steamSeq).padStart(4, '0')}`, me.id);
    return c;
  }
  const put = (c: Awaited<ReturnType<typeof loggedIn>>) => c.request('PUT', '/api/me/library-games/3498', game);

  beforeEach(() => {
    steamOwned = [];
    steamStatus = 200;
  });

  it('이름이 같으면(대소문자·™ 등 표기 차이 무시) 409이고 저장하지 않는다', async () => {
    steamOwned = ['GRAND THEFT AUTO V™'];
    const c = await linked();
    const res = await put(c);
    assert.equal(res.status, 409);
    assert.match(res.json.error, /Steam/);
    assert.deepEqual((await c.request('GET', '/api/me/library-games')).json.games, []);
  });

  it('Steam에 없는 게임은 추가된다', async () => {
    steamOwned = ['Portal 2'];
    const c = await linked();
    assert.equal((await put(c)).status, 204);
  });

  it('이미 직접 추가해 둔 게임은 나중에 Steam으로 사도 다시 저장할 수 있다', async () => {
    const c = await linked();
    assert.equal((await put(c)).status, 204);
    steamOwned = ['Grand Theft Auto V'];
    assert.equal((await put(c)).status, 204);
  });

  it('Steam 보유 목록을 못 가져오면(장애) 막지 않는다', async () => {
    steamStatus = 503;
    const warn = mock.method(console, 'warn', () => {});
    const c = await linked();
    assert.equal((await put(c)).status, 204);
    warn.mock.restore();
  });

  it('Steam을 연동하지 않은 사용자는 Steam을 부르지 않는다', async () => {
    steamOwned = ['Grand Theft Auto V'];
    const before = fake.callsTo('api.steampowered.com').length;
    const c = await loggedIn();
    assert.equal((await put(c)).status, 204);
    assert.equal(fake.callsTo('api.steampowered.com').length, before);
  });
});
