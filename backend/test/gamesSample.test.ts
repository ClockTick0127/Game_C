import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestServer } from './helpers.ts';

// RAWG_API_KEY가 없는 샘플 모드. 외부 API를 부르지 않는다.
let t: Awaited<ReturnType<typeof startTestServer>>;

before(async () => {
  t = await startTestServer();
});
after(() => t.close());

const get = (path: string) => t.client().request('GET', path);

describe('GET /api/games — 입력 검증', () => {
  it('start, end가 없거나 형식이 틀리면 400', async () => {
    assert.equal((await get('/api/games')).status, 400);
    assert.equal((await get('/api/games?start=2026-09-01')).status, 400);
    assert.equal((await get('/api/games?start=2026/09/01&end=2026/09/30')).status, 400);
    assert.equal((await get('/api/games?start=abc&end=def')).status, 400);
  });

  it('실제로 존재하지 않는 날짜는 400 (2월 30일, 0년)', async () => {
    assert.equal((await get('/api/games?start=2026-02-30&end=2026-03-05')).status, 400);
    assert.equal((await get('/api/games?start=0050-01-01&end=0050-01-10')).status, 400);
  });

  it('쿼리를 배열로 여러 번 보내도 400', async () => {
    assert.equal((await get('/api/games?start=2026-09-01&start=2026-09-02&end=2026-09-30')).status, 400);
  });

  it('start가 end보다 늦으면 400', async () => {
    const res = await get('/api/games?start=2026-09-30&end=2026-09-01');
    assert.equal(res.status, 400);
  });

  it('조회 기간이 62일을 넘으면 400, 62일까지는 허용', async () => {
    assert.equal((await get('/api/games?start=2026-01-01&end=2026-12-31')).status, 400);
    assert.equal((await get('/api/games?start=2026-09-01&end=2026-11-02')).status, 200); // 정확히 62일 차이
    assert.equal((await get('/api/games?start=2026-09-01&end=2026-11-03')).status, 400); // 63일 차이
  });
});

describe('GET /api/games — 샘플 모드 응답', () => {
  it('sample: true와 함께 기간 안의 샘플 게임만 돌려준다', async () => {
    const res = await get('/api/games?start=2026-09-01&end=2026-09-30');
    assert.equal(res.status, 200);
    assert.equal(res.json.sample, true);
    assert.ok(Array.isArray(res.json.games));
    for (const game of res.json.games as { released: string }[]) {
      assert.ok(game.released >= '2026-09-01' && game.released <= '2026-09-30', game.released);
    }
  });

  it('health에도 샘플 모드가 표시된다', async () => {
    assert.equal((await get('/api/health')).json.sample, true);
  });
});

describe('그 밖의 게임 API — 샘플 모드', () => {
  it('검색은 404 (샘플 모드에서는 찾을 수 없다)', async () => {
    assert.equal((await get('/api/games/search?name=Elden%20Ring')).status, 404);
  });

  it('검색어가 없거나 100자를 넘으면 400', async () => {
    assert.equal((await get('/api/games/search')).status, 400);
    assert.equal((await get('/api/games/search?name=%20%20')).status, 400);
    assert.equal((await get(`/api/games/search?name=${'a'.repeat(101)}`)).status, 400);
  });

  it('스토어 정보는 비어 있는 응답', async () => {
    const res = await get('/api/games/123/store-info');
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, {
      stores: [],
      steam: null,
      metacritic: null,
      details: null,
      related: null,
      ios: null,
    });
  });

  it('게임 ID가 양의 정수가 아니면 400', async () => {
    for (const id of ['abc', '0', '-5', '1.5', '1e3', '0x10', '1'.repeat(20)]) {
      assert.equal((await get(`/api/games/${id}/store-info`)).status, 400, id);
    }
  });
});
