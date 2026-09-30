import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { installFakeFetch, json } from './fakeExternal.ts';
import { startTestServer } from './helpers.ts';

let t: Awaited<ReturnType<typeof startTestServer>>;

let fake: ReturnType<typeof installFakeFetch>;

before(async () => {
  t = await startTestServer();
  // Steam 스토어 검색: 이름이 정확히 같은 앱만 인정한다
  fake = installFakeFetch(t.base, (url) =>
    url.host === 'store.steampowered.com'
      ? json({ items: [{ id: 271590, name: 'Grand Theft Auto V', type: 'app' }] })
      : undefined,
  );
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
