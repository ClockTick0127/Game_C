import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { installFakeFetch, json, type ExternalHandler } from './fakeExternal.ts';
import { startTestServer } from './helpers.ts';

process.env.POPULAR_GAP_MS = '0';

let t: Awaited<ReturnType<typeof startTestServer>>;
let fake: ReturnType<typeof installFakeFetch>;
let warn: ReturnType<typeof mock.method>;

let spyGenreFailing: string | null = null;

const game = (appid: number) => ({ appid, name: `G${appid}`, owners: '2,000,000 .. 5,000,000', ccu: 1, price: '0' });

const handler: ExternalHandler = (url) => {
  if (url.host === 'steamspy.com') {
    const genre = url.searchParams.get('genre')!;
    if (genre === spyGenreFailing) return new Response('down', { status: 503 });
    return json(genre === 'Action' ? { '1': game(1), '2': game(2) } : {});
  }
  return undefined;
};

before(async () => {
  t = await startTestServer();
});
after(() => t.close());
beforeEach(() => {
  warn = mock.method(console, 'warn', () => {});
  fake = installFakeFetch(t.base, handler);
});
afterEach(() => {
  fake.restore();
  mock.restoreAll();
});

const get = () => t.client().request('GET', '/api/popular');

describe('인기 게임 — 외부 API 실패', () => {
  it('SteamSpy 장르 하나가 실패하면 일부만 반영하지 않고 비어 있는 채로 둔다', async () => {
    spyGenreFailing = 'Strategy';
    const { whenIdle } = await import('../src/services/popular.ts');

    await get();
    await whenIdle();

    const res = await get();
    assert.equal(res.status, 200);
    assert.equal(res.json.status.ready, false);
    assert.equal(res.json.exchange, null); // 환율을 못 받아도 응답은 정상이고, 화면은 달러로 보여 준다
    assert.match(warn.mock.calls.map((c) => c.arguments.join(' ')).join('\n'), /인기 게임 수집 실패/);
  });

  it('실패 직후에는 다시 시도하지 않는다 (대기 시간 동안 외부 호출을 늘리지 않는다)', async () => {
    spyGenreFailing = null; // 이제 SteamSpy가 살아 있어도, 재시도 대기 시간 안이면 부르지 않는다
    await get();
    const { whenIdle } = await import('../src/services/popular.ts');
    await whenIdle();
    assert.equal(fake.callsTo('steamspy.com').length, 0);
    assert.equal((await get()).json.status.ready, false);
  });
});
