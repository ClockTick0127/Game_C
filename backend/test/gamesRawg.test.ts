import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import { installFakeFetch, json, rawgGame, type ExternalHandler } from './fakeExternal.ts';
import { startTestServer } from './helpers.ts';

const API_KEY = 'test-secret-key-123';
const RAWG = 'api.rawg.io';
const STEAM = 'store.steampowered.com';

let t: Awaited<ReturnType<typeof startTestServer>>;
let fake: ReturnType<typeof installFakeFetch>;

before(async () => {
  t = await startTestServer({ rawgKey: API_KEY });
});
after(() => t.close());
afterEach(() => fake?.restore());

/** 이 테스트에서 나갈 외부 요청을 handler로 응답하게 하고 요청을 보낸다 */
function withExternal(handler: ExternalHandler) {
  fake = installFakeFetch(t.base, handler);
  return fake;
}
const get = (path: string) => t.client().request('GET', path);

// 서버의 캐시는 파일 안에서 공유되므로 테스트마다 다른 기간·이름·게임 ID를 쓴다.
describe('GET /api/games — RAWG 목록', () => {
  it('성인 게임과 출시일 없는 게임을 거르고, 중복을 합치고, 이미지를 줄인다', async () => {
    withExternal(() =>
      json({
        count: 4,
        next: null,
        results: [
          rawgGame({
            id: 1,
            name: 'Silent Hill: Townfall',
            released: '2026-10-01',
            platforms: [{ platform: { id: 4, name: 'PC', slug: 'pc' } }],
          }),
          rawgGame({
            id: 2,
            name: 'Silent Hill Townfall',
            released: '2026-10-01',
            platforms: [{ platform: { id: 187, name: 'PlayStation 5', slug: 'playstation5' } }],
          }),
          rawgGame({ id: 3, name: '성인 게임', released: '2026-10-02', tags: [{ slug: 'hentai' }] }),
          rawgGame({ id: 4, name: '출시일 미정', released: null }),
        ],
      }),
    );
    const res = await get('/api/games?start=2026-10-01&end=2026-10-31');

    assert.equal(res.status, 200);
    assert.equal(res.json.sample, false);
    const games = res.json.games as { id: number; name: string; platforms: string[]; image: string }[];
    assert.deepEqual(
      games.map((g) => g.id),
      [1],
    ); // 성인(3), 출시일 없음(4) 제외, 중복(2)은 1에 합쳐짐
    assert.deepEqual(games[0]!.platforms.sort(), ['PC', 'PlayStation 5']);
    assert.match(games[0]!.image, /\/media\/resize\/640\/-\/games\//);
  });

  it('요청에 API 키를 붙이지만 응답에는 키가 드러나지 않는다', async () => {
    const f = withExternal(() => json({ count: 0, next: null, results: [rawgGame({ id: 10, name: 'Key Test' })] }));
    const res = await get('/api/games?start=2026-11-01&end=2026-11-30');

    assert.equal(f.callsTo(RAWG, '/api/games')[0]!.searchParams.get('key'), API_KEY);
    assert.equal(f.calls[0]!.searchParams.get('dates'), '2026-11-01,2026-11-30');
    assert.ok(!JSON.stringify(res.json).includes(API_KEY));
  });

  it('다음 페이지가 있으면 최대 3페이지까지만 가져온다', async () => {
    const f = withExternal((url) => {
      const page = Number(url.searchParams.get('page'));
      return json({
        count: 999,
        next: 'more',
        results: [rawgGame({ id: 100 + page, name: `Page ${page} Game`, released: '2026-12-10' })],
      });
    });
    const res = await get('/api/games?start=2026-12-01&end=2026-12-31');

    assert.equal(f.callsTo(RAWG, '/api/games').length, 3);
    assert.equal(res.json.games.length, 3);
  });

  it('같은 기간을 다시 조회하면 캐시를 쓴다', async () => {
    const f = withExternal(() => json({ count: 1, next: null, results: [rawgGame({ id: 20, name: 'Cached Game' })] }));
    await get('/api/games?start=2027-01-01&end=2027-01-31');
    await get('/api/games?start=2027-01-01&end=2027-01-31');
    assert.equal(f.calls.length, 1);
  });

  it('동시에 같은 기간을 조회해도 RAWG는 한 번만 부른다', async () => {
    const f = withExternal(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return json({ count: 1, next: null, results: [rawgGame({ id: 30, name: 'Concurrent Game' })] });
    });
    await Promise.all([1, 2, 3].map(() => get('/api/games?start=2027-02-01&end=2027-02-28')));
    assert.equal(f.calls.length, 1);
  });
});

describe('GET /api/games — RAWG 오류 처리', () => {
  it('RAWG 5xx는 502로 바꿔 알린다', async () => {
    withExternal(() => new Response('oops', { status: 500 }));
    const res = await get('/api/games?start=2027-03-01&end=2027-03-31');
    assert.equal(res.status, 502);
    assert.match(res.json.error, /HTTP 500/);
  });

  it('연결 실패는 502, 시간 초과는 504', async () => {
    withExternal(() => {
      throw new TypeError('fetch failed');
    });
    assert.equal((await get('/api/games?start=2027-04-01&end=2027-04-30')).status, 502);
    fake.restore();

    withExternal(() => {
      throw new DOMException('timed out', 'TimeoutError');
    });
    assert.equal((await get('/api/games?start=2027-05-01&end=2027-05-31')).status, 504);
  });

  it('API 키가 거부되어도 응답에 키 값이나 설정 위치는 포함되지 않는다', async () => {
    withExternal(() => new Response('unauthorized', { status: 401 }));
    const res = await get('/api/games?start=2027-06-01&end=2027-06-30');
    assert.equal(res.status, 502);
    assert.ok(!JSON.stringify(res.json).includes(API_KEY));
    assert.ok(!/.env|RAWG_API_KEY/.test(res.json.error));
  });

  it('실패한 결과는 캐시하지 않아 다음 요청에서 다시 시도한다', async () => {
    let attempt = 0;
    const f = withExternal(() =>
      ++attempt === 1
        ? new Response('oops', { status: 500 })
        : json({ count: 1, next: null, results: [rawgGame({ id: 40, name: 'Retry Game', released: '2027-07-10' })] }),
    );
    assert.equal((await get('/api/games?start=2027-07-01&end=2027-07-31')).status, 502);
    const retry = await get('/api/games?start=2027-07-01&end=2027-07-31');
    assert.equal(retry.status, 200);
    assert.equal(retry.json.games.length, 1);
    assert.equal(f.calls.length, 2);
  });
});

describe('GET /api/games/search', () => {
  const results = [
    rawgGame({ id: 501, name: 'God of War', released: '2022-01-14' }),
    rawgGame({ id: 502, name: 'God of War', released: '2018-04-20' }),
    rawgGame({ id: 503, name: 'God of War Ragnarok', released: '2022-11-09' }),
  ];

  it('출시 연도를 주면 그 해에 나온 이름이 같은 게임을 고른다', async () => {
    withExternal(() => json({ count: 3, next: null, results }));
    const res = await get('/api/games/search?name=God%20of%20War&year=2018');
    assert.equal(res.status, 200);
    assert.equal(res.json.id, 502);
  });

  it('연도가 없으면 이름이 정확히 같은 첫 결과를 고른다', async () => {
    withExternal(() => json({ count: 3, next: null, results }));
    const res = await get('/api/games/search?name=God%20of%20War%20Ragnarok');
    assert.equal(res.json.id, 503);
  });

  it('정확히 같은 이름이 없으면 첫 결과로 대신한다', async () => {
    withExternal(() =>
      json({ count: 1, next: null, results: [rawgGame({ id: 510, name: 'Elden Ring: Shadow of the Erdtree' })] }),
    );
    assert.equal((await get('/api/games/search?name=Elden%20Ring%20DLC')).json.id, 510);
  });

  it('결과가 없으면 404', async () => {
    withExternal(() => json({ count: 0, next: null, results: [] }));
    assert.equal((await get('/api/games/search?name=zzzz-no-such-game')).status, 404);
  });

  it('같은 검색은 대소문자와 상관없이 캐시한다', async () => {
    const f = withExternal(() => json({ count: 1, next: null, results: [rawgGame({ id: 520, name: 'Hades' })] }));
    await get('/api/games/search?name=Hades');
    await get('/api/games/search?name=hades');
    assert.equal(f.calls.length, 1);
  });

  it('범위를 벗어난 연도는 무시하고 검색한다', async () => {
    const f = withExternal(() => json({ count: 1, next: null, results: [rawgGame({ id: 530, name: 'Celeste' })] }));
    assert.equal((await get('/api/games/search?name=Celeste&year=99999')).status, 200);
    assert.equal(f.calls.length, 1);
  });
});

describe('GET /api/games/:id/store-info', () => {
  const steamReviews = {
    success: 1,
    query_summary: {
      review_score: 8,
      review_score_desc: 'Very Positive',
      total_positive: 90,
      total_negative: 10,
      total_reviews: 100,
    },
  };

  it('스토어 링크를 정해진 순서로 보여주고, http는 https로 올리고, 위험한 링크는 버린다', async () => {
    withExternal((url) => {
      if (url.pathname === '/api/games/601/stores') {
        return json({
          results: [
            { store_id: 5, url: 'http://www.gog.com/game/x' },
            { store_id: 11, url: 'https://store.epicgames.com/p/x' },
            { store_id: 1, url: 'https://store.steampowered.com/app/892970/Valheim/' },
            { store_id: 3, url: 'javascript:alert(1)' },
          ],
        });
      }
      if (url.host === STEAM && url.pathname === '/appreviews/892970') return json(steamReviews);
      if (url.host === STEAM && url.pathname === '/api/appdetails')
        return json({ '892970': { success: true, data: {} } });
      return undefined;
    });
    const res = await get('/api/games/601/store-info');

    assert.equal(res.status, 200);
    const stores = res.json.stores as { slug: string; url: string }[];
    assert.deepEqual(
      stores.map((s) => s.slug),
      ['steam', 'epic-games', 'gog'],
    ); // STORES 순서, PlayStation(위험 링크) 제외
    assert.equal(stores.find((s) => s.slug === 'gog')!.url, 'https://www.gog.com/game/x');
    assert.equal(res.json.steam.appId, 892970);
  });

  it('Steam 사용자 평가와 메타스코어를 만든다 (추적 파라미터 제거)', async () => {
    withExternal((url) => {
      if (url.pathname === '/api/games/602/stores')
        return json({ results: [{ store_id: 1, url: 'https://store.steampowered.com/app/1091500/' }] });
      if (url.pathname === '/appreviews/1091500') return json(steamReviews);
      if (url.pathname === '/api/appdetails') {
        return json({
          '1091500': {
            success: true,
            data: { metacritic: { score: 88, url: 'https://www.metacritic.com/game/pc/x/?ftag=MCD-06' } },
          },
        });
      }
      return undefined;
    });
    const res = await get('/api/games/602/store-info');

    assert.deepEqual(res.json.steam, {
      appId: 1091500,
      label: '매우 긍정적',
      score: 8,
      percent: 90,
      total: 100,
      url: 'https://store.steampowered.com/app/1091500/#app_reviews_hash',
    });
    assert.deepEqual(res.json.metacritic, { score: 88, url: 'https://www.metacritic.com/game/pc/x/', platform: 'PC' });
  });

  it('메타크리틱이 아닌 도메인의 링크는 점수만 남기고 링크는 버린다', async () => {
    withExternal((url) => {
      if (url.pathname === '/api/games/603/stores')
        return json({ results: [{ store_id: 1, url: 'https://store.steampowered.com/app/2/' }] });
      if (url.pathname === '/appreviews/2') return json(steamReviews);
      if (url.pathname === '/api/appdetails')
        return json({ '2': { success: true, data: { metacritic: { score: 70, url: 'https://evil.example.com/x' } } } });
      return undefined;
    });
    const res = await get('/api/games/603/store-info');
    assert.deepEqual(res.json.metacritic, { score: 70, url: null, platform: 'PC' });
  });

  it('RAWG에 Steam 링크가 없는 PC 게임은 이름으로 Steam을 찾되, DLC 같은 비슷한 이름은 무시한다', async () => {
    withExternal((url) => {
      if (url.pathname === '/api/games/604/stores') return json({ results: [] });
      if (url.pathname === '/api/games/604')
        return json({ name: 'Hollow Knight', platforms: [{ platform: { slug: 'pc' } }] });
      if (url.pathname === '/api/storesearch/') {
        return json({
          items: [
            { id: 111, name: 'Hollow Knight - Soundtrack', type: 'dlc' },
            { id: 222, name: 'HOLLOW KNIGHT', type: 'app' },
          ],
        });
      }
      if (url.pathname === '/appreviews/222') return json(steamReviews);
      if (url.pathname === '/api/appdetails') return json({ '222': { success: true, data: {} } });
      return undefined;
    });
    const res = await get('/api/games/604/store-info');

    assert.equal(res.json.stores[0].slug, 'steam');
    assert.equal(res.json.stores[0].url, 'https://store.steampowered.com/app/222/');
    assert.equal(res.json.steam.appId, 222);
  });

  it('PC 게임이 아니면 Steam 검색을 하지 않는다', async () => {
    const f = withExternal((url) => {
      if (url.pathname === '/api/games/605/stores')
        return json({ results: [{ store_id: 3, url: 'https://store.playstation.com/x' }] });
      if (url.pathname === '/api/games/605')
        return json({ name: 'Console Only', platforms: [{ platform: { slug: 'playstation5' } }] });
      return undefined;
    });
    const res = await get('/api/games/605/store-info');

    assert.equal(f.callsTo(STEAM).length, 0);
    assert.deepEqual(res.json, {
      stores: [{ slug: 'playstation-store', name: 'PlayStation Store', url: 'https://store.playstation.com/x' }],
      steam: null,
      metacritic: null,
    });
  });

  it('Steam이 실패해도 오류가 아니라 평가 없이 스토어 링크만 돌려준다', async () => {
    withExternal((url) => {
      if (url.pathname === '/api/games/606/stores')
        return json({ results: [{ store_id: 1, url: 'https://store.steampowered.com/app/3/' }] });
      if (url.host === STEAM) return new Response('down', { status: 503 });
      return undefined;
    });
    const res = await get('/api/games/606/store-info');

    assert.equal(res.status, 200);
    assert.equal(res.json.stores.length, 1);
    assert.equal(res.json.steam, null);
    assert.equal(res.json.metacritic, null);
  });

  it('리뷰가 10개 미만이라 Steam이 등급을 매기지 않으면 label과 percent 처리', async () => {
    withExternal((url) => {
      if (url.pathname === '/api/games/607/stores')
        return json({ results: [{ store_id: 1, url: 'https://store.steampowered.com/app/4/' }] });
      if (url.pathname === '/appreviews/4') {
        return json({
          success: 1,
          query_summary: {
            review_score: 0,
            review_score_desc: '3 user reviews',
            total_positive: 3,
            total_negative: 0,
            total_reviews: 3,
          },
        });
      }
      if (url.pathname === '/api/appdetails') return json({ '4': { success: true, data: {} } });
      return undefined;
    });
    const res = await get('/api/games/607/store-info');
    assert.equal(res.json.steam.label, null);
    assert.equal(res.json.steam.total, 3);
  });

  it('RAWG에 없는 게임은 404', async () => {
    withExternal(() => new Response('not found', { status: 404 }));
    const res = await get('/api/games/999999/store-info');
    assert.equal(res.status, 404);
  });

  it('같은 게임의 스토어 정보는 캐시한다', async () => {
    const f = withExternal((url) => {
      if (url.pathname === '/api/games/608/stores')
        return json({ results: [{ store_id: 3, url: 'https://store.playstation.com/y' }] });
      if (url.pathname === '/api/games/608') return json({ name: 'Cache Me', platforms: [] });
      return undefined;
    });
    await get('/api/games/608/store-info');
    const after = f.calls.length;
    await get('/api/games/608/store-info');
    assert.equal(f.calls.length, after);
  });
});
