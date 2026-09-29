import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { installFakeFetch, json, rawgGame, type ExternalHandler } from './fakeExternal.ts';
import { startTestServer } from './helpers.ts';

let t: Awaited<ReturnType<typeof startTestServer>>;
let fake: ReturnType<typeof installFakeFetch>;
let errorLog: ReturnType<typeof mock.method>;

before(async () => {
  t = await startTestServer({ rawgKey: 'test-key' });
});
after(() => t.close());
beforeEach(() => {
  errorLog = mock.method(console, 'error', () => {});
  mock.method(console, 'warn', () => {});
});
afterEach(() => {
  fake?.restore();
  mock.restoreAll();
});

function withExternal(handler: ExternalHandler) {
  fake = installFakeFetch(t.base, handler);
  return fake;
}
const get = (path: string) => t.client().request('GET', path);
const logged = () => errorLog.mock.calls.map((c) => c.arguments.join(' ')).join('\n');

// 서버의 캐시는 파일 안에서 공유되므로 테스트마다 다른 기간·게임 ID를 쓴다.
describe('월 단위 캐시', () => {
  it('같은 달 안에서 기간을 바꿔도 RAWG는 한 번만 부르고, 요청한 기간의 게임만 돌려준다', async () => {
    const f = withExternal(() =>
      json({
        count: 2,
        next: null,
        results: [
          rawgGame({ id: 1, name: 'Early Game', released: '2028-01-05' }),
          rawgGame({ id: 2, name: 'Late Game', released: '2028-01-20' }),
        ],
      }),
    );
    const first = await get('/api/games?start=2028-01-01&end=2028-01-10');
    const second = await get('/api/games?start=2028-01-15&end=2028-01-31');
    const third = await get('/api/games?start=2028-01-02&end=2028-01-30');

    assert.deepEqual(
      (first.json.games as { id: number }[]).map((g) => g.id),
      [1],
    );
    assert.deepEqual(
      (second.json.games as { id: number }[]).map((g) => g.id),
      [2],
    );
    assert.equal(third.json.games.length, 2);
    // 요청한 기간이 아니라 그 달 전체(1일~31일)를 RAWG에 물어본다
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0]!.searchParams.get('dates'), '2028-01-01,2028-01-31');
  });

  it('두 달에 걸친 기간은 달마다 조회해서 합친다', async () => {
    const f = withExternal((url) => {
      const dates = url.searchParams.get('dates')!;
      if (dates.startsWith('2028-02'))
        return json({
          count: 1,
          next: null,
          results: [rawgGame({ id: 11, name: 'Feb Game', released: '2028-02-20' })],
        });
      if (dates.startsWith('2028-03'))
        return json({
          count: 1,
          next: null,
          results: [rawgGame({ id: 12, name: 'Mar Game', released: '2028-03-05' })],
        });
      return undefined;
    });
    const res = await get('/api/games?start=2028-02-15&end=2028-03-10');

    assert.deepEqual((res.json.games as { id: number }[]).map((g) => g.id).sort(), [11, 12]);
    assert.deepEqual(f.calls.map((u) => u.searchParams.get('dates')).sort(), [
      '2028-02-01,2028-02-29',
      '2028-03-01,2028-03-31',
    ]); // 2028은 윤년
  });
});

describe('일부 페이지 실패', () => {
  const page = (n: number) =>
    json({
      count: 100,
      next: 'more',
      results: [rawgGame({ id: 300 + n, name: `Page ${n} Game`, released: '2028-04-10' })],
    });

  it('첫 페이지만 성공해도 받은 만큼 응답하고 partial로 표시하며, 캐시하지 않는다', async () => {
    let page2Attempts = 0;
    const f = withExternal((url) => {
      const n = Number(url.searchParams.get('page'));
      if (n === 2 && ++page2Attempts === 1) return new Response('oops', { status: 500 });
      return page(n);
    });

    const partial = await get('/api/games?start=2028-04-01&end=2028-04-30');
    assert.equal(partial.status, 200);
    assert.equal(partial.json.partial, true);
    assert.deepEqual(
      (partial.json.games as { id: number }[]).map((g) => g.id),
      [301, 303],
    ); // 2페이지만 빠짐

    // 부분 결과는 캐시하지 않으므로 다음 요청은 다시 받아 오고, 이번에는 완전하다
    const complete = await get('/api/games?start=2028-04-01&end=2028-04-30');
    assert.equal(complete.json.partial, undefined);
    assert.deepEqual(
      (complete.json.games as { id: number }[]).map((g) => g.id),
      [301, 302, 303],
    );
    assert.equal(f.calls.length, 6);

    // 완전한 결과는 캐시된다
    await get('/api/games?start=2028-04-01&end=2028-04-30');
    assert.equal(f.calls.length, 6);
    assert.match(logged() + '', /^$/); // 부분 실패는 경고(warn)일 뿐 오류 로그가 아니다
  });

  it('나머지 페이지는 순서대로가 아니라 동시에 요청한다', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    withExternal(async (url) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 40));
      inFlight--;
      return page(Number(url.searchParams.get('page')));
    });
    await get('/api/games?start=2028-05-01&end=2028-05-31');
    assert.equal(maxInFlight, 2); // 첫 페이지가 끝난 뒤 2, 3페이지를 함께
  });

  it('첫 페이지가 실패하면 오류로 응답한다', async () => {
    withExternal(() => new Response('oops', { status: 500 }));
    assert.equal((await get('/api/games?start=2028-06-01&end=2028-06-30')).status, 502);
  });
});

describe('서버 로그와 사용자 메시지', () => {
  it('RAWG 키 문제는 사용자에게 일반 안내를, 서버 로그에는 원인을 남긴다', async () => {
    withExternal(() => new Response('unauthorized', { status: 401 }));
    const res = await get('/api/games?start=2028-07-01&end=2028-07-31');

    assert.equal(res.status, 502);
    assert.doesNotMatch(res.json.error, /\.env|RAWG_API_KEY/);
    assert.match(logged(), /502.*GET \/api\/games.*RAWG_API_KEY/);
  });

  it('RAWG 한도 초과(429)는 503으로 알리고 로그에 남긴다', async () => {
    withExternal(() => new Response('too many', { status: 429 }));
    const res = await get('/api/games?start=2028-08-01&end=2028-08-31');

    assert.equal(res.status, 503);
    assert.match(res.json.error, /몰려/);
    assert.match(logged(), /503.*429/);
  });

  it('연결 실패와 시간 초과도 서버 로그에 남는다', async () => {
    withExternal(() => {
      throw new TypeError('fetch failed');
    });
    await get('/api/games?start=2028-09-01&end=2028-09-30');
    assert.match(logged(), /502.*연결 실패/);
    fake.restore();

    withExternal(() => {
      throw new DOMException('timed out', 'TimeoutError');
    });
    await get('/api/games?start=2028-10-01&end=2028-10-31');
    assert.match(logged(), /504.*응답하지 않았습니다/);
  });

  it('사용자 잘못(400, 404)은 서버 오류 로그에 남기지 않는다', async () => {
    withExternal(() => json({ count: 0, next: null, results: [] }));
    await get('/api/games?start=bad&end=bad');
    await get('/api/games/search?name=no-such-game-xyz');
    assert.equal(errorLog.mock.callCount(), 0);
  });
});

describe('없는 게임 번호 조회', () => {
  it('RAWG에 없다고 확인된 번호는 잠시 기억해 다시 RAWG를 부르지 않는다', async () => {
    const f = withExternal(() => new Response('nf', { status: 404 }));

    assert.equal((await get('/api/games/777001/store-info')).status, 404);
    const afterFirst = f.calls.length;
    assert.ok(afterFirst >= 1);

    for (let i = 0; i < 5; i++) {
      const res = await get('/api/games/777001/store-info');
      assert.equal(res.status, 404);
      assert.equal(res.json.error, '게임을 찾을 수 없습니다.');
    }
    assert.equal(f.calls.length, afterFirst); // 이후 5번은 RAWG를 부르지 않았다

    // 다른 번호는 그대로 확인한다
    await get('/api/games/777002/store-info');
    assert.ok(f.calls.length > afterFirst);
  });

  it('없는 번호를 많이 조회해도 정상 게임의 캐시를 밀어내지 않는다', async () => {
    const f = withExternal((url) => {
      if (url.pathname === '/api/games/888001/stores')
        return json({ results: [{ store_id: 3, url: 'https://store.playstation.com/z' }] });
      if (url.pathname === '/api/games/888001') return json({ name: 'Real Game', platforms: [] });
      return new Response('nf', { status: 404 });
    });
    await get('/api/games/888001/store-info');
    const calls = f.calls.length;

    for (let i = 0; i < 30; i++) await get(`/api/games/${999000 + i}/store-info`);
    const before = f.calls.length;
    assert.equal((await get('/api/games/888001/store-info')).status, 200);
    assert.equal(f.calls.length, before); // 정상 게임은 여전히 캐시에서 나온다
    assert.ok(calls > 0);
  });
});
