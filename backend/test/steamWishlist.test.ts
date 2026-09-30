import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { installFakeFetch, json, rawgGame } from './fakeExternal.ts';
import { startTestServer } from './helpers.ts';

process.env.GAME_STYLES_DISABLED = '1';

let t: Awaited<ReturnType<typeof startTestServer>>;
let fake: ReturnType<typeof installFakeFetch>;

/** Steam 위시리스트 응답 (앱 번호, 우선순위, 담은 시각) */
let wishlist: { appid: number; priority?: number; date_added?: number }[] = [];
/** Steam 스토어가 아는 앱들 */
let storeItems: Record<number, { name: string; type?: number; released?: number }> = {};
/** RAWG 검색어 → 결과 */
let rawgResults: Record<string, ReturnType<typeof rawgGame>[]> = {};
/** true면 Steam이 서버 오류를 낸다 */
let steamDown = false;
/** 이 검색어에는 RAWG가 한도 초과(429)를 응답한다 */
let rawgLimitedTerm: string | null = null;

before(async () => {
  t = await startTestServer({ rawgKey: 'test-rawg-key' });
  fake = installFakeFetch(t.base, (url) => {
    if (url.host === 'api.steampowered.com' && steamDown) return new Response('down', { status: 503 });
    if (url.pathname === '/IWishlistService/GetWishlist/v1/') {
      return json({ response: wishlist.length > 0 ? { items: wishlist } : {} });
    }
    if (url.pathname === '/IStoreBrowseService/GetItems/v1/') {
      const { ids } = JSON.parse(url.searchParams.get('input_json')!) as { ids: { appid: number }[] };
      return json({
        response: {
          store_items: ids.map(({ appid }) => {
            const item = storeItems[appid];
            if (!item) return { id: appid, success: 15, visible: false, name: '', appid: 0 };
            return {
              id: appid,
              appid,
              success: 1,
              visible: true,
              name: item.name,
              type: item.type ?? 0,
              release: item.released === undefined ? {} : { steam_release_date: item.released },
            };
          }),
        },
      });
    }
    if (url.host === 'api.rawg.io' && url.pathname === '/api/games') {
      const term = url.searchParams.get('search')!;
      if (term === rawgLimitedTerm) return new Response('', { status: 429 });
      const results = rawgResults[term] ?? [];
      return json({ count: results.length, next: null, results });
    }
    return undefined;
  });
});
after(() => {
  fake.restore();
  return t.close();
});
beforeEach(() => {
  wishlist = [];
  storeItems = {};
  rawgResults = {};
  steamDown = false;
  rawgLimitedTerm = null;
  fake.calls.length = 0;
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
});
afterEach(() => mock.restoreAll());

let seq = 0;
/** 가입하고 Steam 계정을 연동한 클라이언트. 계정마다 다른 SteamID라 위시리스트 캐시가 섞이지 않는다 */
async function linked() {
  const c = t.client();
  const email = `wish${++seq}@example.com`;
  const res = await c.request('POST', '/api/auth/signup', { email, password: 'password-1234', nickname: '수집가' });
  assert.equal(res.status, 201);
  t.db.prepare('UPDATE users SET steam_id = ? WHERE email = ?').run(`7656119800000${seq}`, email);
  return c;
}

const rawgCalls = () => fake.callsTo('api.rawg.io').length;
const favoriteIds = async (c: ReturnType<typeof t.client>) =>
  ((await c.request('GET', '/api/me/favorites')).json.games as { id: number }[]).map((g) => g.id);

// 2030-06-15 정오(UTC). 서버는 지역 시간으로 날짜를 만들므로 한낮으로 잡아 어느 시간대에서든 같은 날이 되게 한다
const JUNE_15 = Date.UTC(2030, 5, 15, 12) / 1000;

describe('Steam 위시리스트 — 목록', () => {
  it('로그인해야 하고, Steam을 연동하지 않았으면 404', async () => {
    assert.equal((await t.client().request('GET', '/api/me/steam/wishlist')).status, 401);
    const c = t.client();
    await c.request('POST', '/api/auth/signup', {
      email: 'nolink@example.com',
      password: 'password-1234',
      nickname: '아무개',
    });
    assert.equal((await c.request('GET', '/api/me/steam/wishlist')).status, 404);
    assert.equal((await c.request('POST', '/api/me/steam/wishlist/import', { appIds: [1] })).status, 404);
  });

  it('우선순위를 정한 게임이 먼저, 나머지는 최근에 담은 순이며 DLC와 스토어에 없는 앱은 뺀다', async () => {
    wishlist = [
      { appid: 10, priority: 0, date_added: 100 },
      { appid: 20, priority: 2, date_added: 50 },
      { appid: 30, priority: 1, date_added: 10 },
      { appid: 40, priority: 0, date_added: 200 },
      { appid: 50, priority: 0, date_added: 300 }, // DLC
      { appid: 60, priority: 0, date_added: 400 }, // 스토어에서 내려감
    ];
    storeItems = {
      10: { name: 'Alpha', released: JUNE_15 },
      20: { name: 'Beta' },
      30: { name: 'Gamma', released: JUNE_15 },
      40: { name: 'Delta', released: JUNE_15 },
      50: { name: 'Alpha DLC', type: 4, released: JUNE_15 },
    };
    const c = await linked();
    const res = await c.request('GET', '/api/me/steam/wishlist');
    assert.equal(res.status, 200);
    assert.equal(res.json.excluded, 1);
    assert.deepEqual(
      res.json.items.map((i: { appId: number }) => i.appId),
      [30, 20, 40, 10],
    );
    assert.deepEqual(res.json.items[0], {
      appId: 30,
      name: 'Gamma',
      released: '2030-06-15',
      image: 'https://cdn.akamai.steamstatic.com/steam/apps/30/header.jpg',
      favorite: false,
    });
    assert.equal(res.json.items[1].released, null);
    assert.equal(rawgCalls(), 0, '목록만 볼 때는 RAWG를 부르지 않는다');
  });

  it('비어 있거나 비공개인 위시리스트는 빈 목록', async () => {
    const c = await linked();
    assert.deepEqual((await c.request('GET', '/api/me/steam/wishlist')).json, { items: [], excluded: 0 });
  });

  it('Steam 서버 오류는 502', async () => {
    steamDown = true;
    const c = await linked();
    assert.equal((await c.request('GET', '/api/me/steam/wishlist')).status, 502);
  });
});

describe('Steam 위시리스트 — 관심 게임에 추가', () => {
  it('이름이 같은 RAWG 게임을 찾아 관심 게임에 넣고, 못 찾거나 출시일이 없는 게임은 사유를 알린다', async () => {
    wishlist = [{ appid: 1 }, { appid: 2 }, { appid: 3 }, { appid: 4 }];
    storeItems = {
      1: { name: 'ELDEN RING', released: JUNE_15 },
      2: { name: 'Unknown Indie', released: JUNE_15 },
      3: { name: 'No Date Game' },
      4: { name: 'Already Added', released: JUNE_15 },
    };
    rawgResults = {
      'ELDEN RING': [rawgGame({ id: 100, name: 'Elden Ring', released: '2030-06-15' })],
      'Unknown Indie': [rawgGame({ id: 101, name: 'Unknown Indie 2' })], // 이름이 다르면 인정하지 않는다
      'No Date Game': [rawgGame({ id: 102, name: 'No Date Game', released: null })],
      'Already Added': [rawgGame({ id: 103, name: 'Already Added' })],
    };
    const c = await linked();
    await c.request('PUT', '/api/me/favorites/103', favoriteGame(103, 'Already Added'));

    const res = await c.request('POST', '/api/me/steam/wishlist/import', { appIds: [1, 2, 3, 4, 999] });
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.json.results.map((r: { appId: number; status: string }) => [r.appId, r.status]),
      [
        [1, 'added'],
        [2, 'notFound'],
        [3, 'noDate'],
        [4, 'exists'],
        [999, 'notFound'],
      ],
    );
    assert.equal(res.json.results[0].game.id, 100);
    assert.equal(res.json.results[0].game.released, '2030-06-15');
    assert.equal(res.json.results[1].game, null);
    assert.deepEqual((await favoriteIds(c)).sort(), [100, 103]);

    // 다음 목록 조회에서는 관심 게임인 것이 표시된다 (대응표 + 관심 게임 목록)
    const list = await c.request('GET', '/api/me/steam/wishlist');
    assert.deepEqual(
      list.json.items.map((i: { appId: number; favorite: boolean }) => [i.appId, i.favorite]),
      [
        [1, true],
        [2, false],
        [3, false],
        [4, true],
      ],
    );
  });

  it('RAWG에 출시일이 없으면 Steam 출시일을 쓰고, 같은 이름이 여럿이면 출시 연도가 같은 것을 고른다', async () => {
    wishlist = [{ appid: 7 }, { appid: 8 }];
    storeItems = { 7: { name: 'Remake', released: JUNE_15 }, 8: { name: 'TBA Title', released: JUNE_15 } };
    rawgResults = {
      Remake: [
        rawgGame({ id: 200, name: 'Remake', released: '2015-03-01' }),
        rawgGame({ id: 201, name: 'REMAKE', released: '2030-11-01' }),
      ],
      'TBA Title': [rawgGame({ id: 202, name: 'TBA Title', released: null })],
    };
    const c = await linked();
    const res = await c.request('POST', '/api/me/steam/wishlist/import', { appIds: [7, 8] });
    assert.equal(res.json.results[0].game.id, 201, '2030년에 나온 항목을 고른다');
    assert.equal(res.json.results[1].status, 'added');
    assert.equal(res.json.results[1].game.released, '2030-06-15', 'Steam 출시일로 대신한다');
  });

  it('한 번 찾은 대응은 다시 RAWG를 부르지 않고, 다른 사용자도 함께 쓴다', async () => {
    wishlist = [{ appid: 11 }];
    storeItems = { 11: { name: 'Shared Game', released: JUNE_15 } };
    rawgResults = { 'Shared Game': [rawgGame({ id: 300, name: 'Shared Game' })] };

    const a = await linked();
    await a.request('POST', '/api/me/steam/wishlist/import', { appIds: [11] });
    assert.equal(rawgCalls(), 1);

    const again = await a.request('POST', '/api/me/steam/wishlist/import', { appIds: [11] });
    assert.equal(again.json.results[0].status, 'exists');
    const b = await linked();
    const other = await b.request('POST', '/api/me/steam/wishlist/import', { appIds: [11] });
    assert.equal(other.json.results[0].status, 'added');
    assert.equal(rawgCalls(), 1, '대응표에 있으면 RAWG를 다시 부르지 않는다');
  });

  it('잘못된 본문은 400 (빈 목록, 10개 초과, 정수가 아닌 값)', async () => {
    const c = await linked();
    for (const appIds of [[], Array.from({ length: 11 }, (_, i) => i + 1), ['a'], [0], undefined]) {
      const res = await c.request('POST', '/api/me/steam/wishlist/import', { appIds });
      assert.equal(res.status, 400, JSON.stringify(appIds));
    }
  });

  it('RAWG 조회에 실패한 게임은 error로 표시하고 나머지는 계속 추가한다', async () => {
    wishlist = [{ appid: 21 }, { appid: 22 }, { appid: 23 }];
    storeItems = {
      21: { name: 'First', released: JUNE_15 },
      22: { name: 'Second', released: JUNE_15 },
      23: { name: 'Third', released: JUNE_15 },
    };
    rawgResults = { First: [rawgGame({ id: 400, name: 'First' })], Third: [rawgGame({ id: 402, name: 'Third' })] };
    rawgLimitedTerm = 'Second';

    const c = await linked();
    const res = await c.request('POST', '/api/me/steam/wishlist/import', { appIds: [21, 22, 23] });
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.json.results.map((r: { appId: number; status: string }) => [r.appId, r.status]),
      [
        [21, 'added'],
        [22, 'error'],
        [23, 'added'],
      ],
    );
    assert.match(res.json.results[1].message, /잠시 후 다시 시도/);
    assert.deepEqual((await favoriteIds(c)).sort(), [400, 402]);

    // 실패한 게임은 대응표에 남지 않아 다음에 다시 찾아본다
    rawgLimitedTerm = null;
    rawgResults.Second = [rawgGame({ id: 401, name: 'Second' })];
    const retry = await c.request('POST', '/api/me/steam/wishlist/import', { appIds: [22] });
    assert.equal(retry.json.results[0].status, 'added');
  });
});

function favoriteGame(id: number, name: string) {
  return {
    id,
    name,
    released: '2030-06-15',
    image: null,
    rating: 4,
    metacritic: null,
    platforms: ['PC'],
    genres: ['RPG'],
    url: null,
  };
}
