import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { installFakeFetch, json, type ExternalHandler } from './fakeExternal.ts';
import { startTestServer } from './helpers.ts';

process.env.POPULAR_GAP_MS = '0';

let t: Awaited<ReturnType<typeof startTestServer>>;
let fake: ReturnType<typeof installFakeFetch>;

const game = (appid: number) => ({ appid, name: `G${appid}`, owners: '2,000,000 .. 5,000,000', ccu: 1, price: '0' });

const handler: ExternalHandler = (url) => {
  if (url.host === 'steamspy.com') {
    return json(url.searchParams.get('genre') === 'Action' ? { '1': game(1), '2': game(2), '3': game(3) } : {});
  }
  // Steam 스토어가 호출 제한(429)을 건다
  if (url.pathname === '/api/appdetails') return new Response('slow down', { status: 429 });
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

describe('인기 게임 — Steam 스토어 호출 제한', () => {
  it('목록은 그대로 보여 주고, 출시 정보는 비워 둔 채 첫 실패에서 멈춘다', async () => {
    const client = t.client();
    await client.request('GET', '/api/popular');
    const { whenIdle } = await import('../src/services/popular.ts');
    await whenIdle();

    const res = await client.request('GET', '/api/popular');
    assert.equal(res.json.status.ready, true);
    assert.equal(res.json.total, 3);
    assert.ok(res.json.games.every((g: { releaseYear: number | null }) => g.releaseYear === null));
    assert.equal(res.json.status.releaseChecked, 0); // 실패한 앱은 조회 완료로 치지 않아 나중에 다시 받는다
    // 제한에 걸렸는데 나머지 앱을 계속 두드리지 않는다
    assert.equal(fake.callsTo('store.steampowered.com').length, 1);
  });
});
