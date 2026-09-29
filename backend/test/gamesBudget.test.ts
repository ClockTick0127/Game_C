import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { installFakeFetch, json, rawgGame } from './fakeExternal.ts';
import { startTestServer } from './helpers.ts';

// 서버 전체의 RAWG 호출 상한은 프로세스 메모리에 있으므로, 다른 테스트와 섞이지 않게 파일을 분리했다.
let t: Awaited<ReturnType<typeof startTestServer>>;
let fake: ReturnType<typeof installFakeFetch>;
let errorLog: ReturnType<typeof mock.method>;

before(async () => {
  t = await startTestServer({ rawgKey: 'test-key', rawgMaxCallsPerMinute: 3 });
});
after(() => t.close());
beforeEach(() => {
  errorLog = mock.method(console, 'error', () => {});
});
afterEach(() => {
  fake?.restore();
  mock.restoreAll();
});

const get = (path: string) => t.client().request('GET', path);

describe('RAWG 분당 호출 상한 (서버 전체)', () => {
  it('상한을 넘는 새 요청은 RAWG를 부르지 않고 503으로 알리며, 캐시된 응답은 계속 제공한다', async () => {
    fake = installFakeFetch(t.base, (url) =>
      json({
        count: 1,
        next: null,
        results: [
          rawgGame({ id: 1, name: 'Budget Game', released: `${url.searchParams.get('dates')!.slice(0, 7)}-10` }),
        ],
      }),
    );

    // 서로 다른 3개 달 = RAWG 3번 (상한 3)
    for (const month of ['2029-01', '2029-02', '2029-03']) {
      assert.equal((await get(`/api/games?start=${month}-01&end=${month}-28`)).status, 200);
    }
    assert.equal(fake.calls.length, 3);

    // 4번째 새 달은 상한 때문에 RAWG로 나가지 않는다
    const blocked = await get('/api/games?start=2029-04-01&end=2029-04-28');
    assert.equal(blocked.status, 503);
    assert.match(blocked.json.error, /몰려/);
    assert.doesNotMatch(blocked.json.error, /RAWG_MAX_CALLS_PER_MINUTE/); // 설정 이름은 사용자에게 보이지 않는다
    assert.equal(fake.calls.length, 3);
    assert.match(
      errorLog.mock.calls.map((c) => c.arguments.join(' ')).join('\n'),
      /분당 3회.*RAWG_MAX_CALLS_PER_MINUTE/,
    );

    // 이미 캐시된 달은 RAWG를 부르지 않으므로 상한과 상관없이 응답한다
    assert.equal((await get('/api/games?start=2029-01-01&end=2029-01-28')).status, 200);
    assert.equal(fake.calls.length, 3);
  });
});
