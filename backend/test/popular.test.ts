import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { installFakeFetch, json, type ExternalHandler } from './fakeExternal.ts';
import { startTestServer } from './helpers.ts';

process.env.POPULAR_GAP_MS = '0';

let t: Awaited<ReturnType<typeof startTestServer>>;
let fake: ReturnType<typeof installFakeFetch>;

const spyGame = (appid: number, name: string, owners: string, ccu: number, extra: Record<string, unknown> = {}) => ({
  appid,
  name,
  developer: 'Dev &amp; Co',
  publisher: 'Pub',
  owners,
  ccu,
  price: '1999',
  discount: '0',
  ...extra,
});

/** 장르별 SteamSpy 응답. 게임 B는 Action과 Indie 양쪽에 나온다 */
const SPY: Record<string, Record<string, unknown>> = {
  Action: {
    '1': spyGame(1, 'Alpha', '5,000,000 .. 10,000,000', 100),
    '2': spyGame(2, 'Bravo', '1,000,000 .. 2,000,000', 500),
    '3': spyGame(3, 'Tiny', '500,000 .. 1,000,000', 9999), // 보유자 100만 미만은 제외
    '4': spyGame(4, 'Delta', '1,000,000 .. 2,000,000', 50),
  },
  Indie: {
    '2': spyGame(2, 'Bravo', '1,000,000 .. 2,000,000', 500),
    '5': spyGame(5, 'Charlie', '20,000,000 .. 50,000,000', 10),
    '999999': spyGame(999999, 'Hidden', '20,000,000 .. 50,000,000', 10), // 개발사 요청으로 숨긴 앱
  },
};

const RELEASE: Record<string, { date: string; win: boolean; mac: boolean; linux: boolean } | null> = {
  '1': { date: 'Aug 3, 2023', win: true, mac: true, linux: false },
  '2': { date: '12 Mar, 2019', win: true, mac: false, linux: false },
  '4': null, // 스토어에서 내려간 앱
  '5': { date: 'Jan 1, 2023', win: true, mac: false, linux: true },
};

const handler: ExternalHandler = (url) => {
  if (url.host === 'api.frankfurter.dev') {
    return json({ amount: 1, base: 'USD', date: '2026-09-29', rates: { KRW: 1353.36 } });
  }
  if (url.host === 'steamspy.com') {
    return json(SPY[url.searchParams.get('genre')!] ?? {});
  }
  if (url.pathname === '/api/appdetails') {
    const id = url.searchParams.get('appids')!;
    const r = RELEASE[id];
    return json({
      [id]: r
        ? {
            success: true,
            data: {
              release_date: { date: r.date },
              platforms: { windows: r.win, mac: r.mac, linux: r.linux },
            },
          }
        : { success: false },
    });
  }
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

const get = (query = '') => t.client().request('GET', `/api/popular${query}`);
const names = (res: { json: { games: { name: string }[] } }) => res.json.games.map((g) => g.name);

describe('인기 게임', () => {
  it('첫 요청은 수집을 시작하고 준비되지 않았다고 알린다. 끝나면 보유자 구간이 큰 순으로 나온다', async () => {
    const first = await get();
    assert.equal(first.status, 200);
    assert.equal(first.json.status.ready, false);
    assert.deepEqual(first.json.games, []);

    const { whenIdle } = await import('../src/services/popular.ts');
    await whenIdle();

    const res = await get();
    assert.equal(res.json.status.ready, true);
    // Charlie(2천만+) > Alpha(500만+) > 같은 구간 안에서는 동시 접속자 많은 Bravo > Delta. Tiny와 Hidden은 제외
    assert.deepEqual(names(res), ['Charlie', 'Alpha', 'Bravo', 'Delta']);
    assert.equal(res.json.total, 4);
  });

  it('여러 장르에 걸친 게임은 한 번만 나오고 장르가 합쳐진다. HTML 엔티티는 풀린다', async () => {
    const res = await get();
    const bravo = res.json.games.find((g: { name: string }) => g.name === 'Bravo');
    assert.deepEqual(bravo.genres, ['Action', 'Indie']);
    assert.equal(bravo.developer, 'Dev & Co');
    assert.equal(bravo.priceUsd, 19.99);
    assert.equal(bravo.ownersMin, 1_000_000);
    assert.equal(bravo.ownersMax, 2_000_000);
  });

  it('Steam 스토어에서 출시 연도와 플랫폼을 채우고, 스토어에 없는 앱은 비워 둔다', async () => {
    const res = await get();
    const by = (name: string) => res.json.games.find((g: { name: string }) => g.name === name);
    assert.equal(by('Alpha').releaseYear, 2023);
    assert.deepEqual(by('Alpha').platforms, { windows: true, mac: true, linux: false });
    assert.equal(by('Bravo').releaseYear, 2019); // "12 Mar, 2019" 형식도 읽는다
    assert.equal(by('Delta').releaseYear, null);
    assert.equal(by('Delta').platforms, null);
    assert.equal(res.json.status.releaseChecked, 4);
  });

  it('장르로 거른다', async () => {
    assert.deepEqual(names(await get('?genre=Indie')), ['Charlie', 'Bravo']);
    assert.deepEqual(names(await get('?genre=Racing')), []);
  });

  it('출시 연도로 거른다 (연도를 모르는 게임은 빠진다)', async () => {
    assert.deepEqual(names(await get('?year=2023')), ['Charlie', 'Alpha']);
    assert.deepEqual(names(await get('?year=2019')), ['Bravo']);
  });

  it('플랫폼으로 거른다', async () => {
    assert.deepEqual(names(await get('?platform=linux')), ['Charlie']);
    assert.deepEqual(names(await get('?platform=mac')), ['Alpha']);
  });

  it('필터를 함께 걸 수 있다', async () => {
    assert.deepEqual(names(await get('?genre=Indie&year=2023&platform=windows')), ['Charlie']);
  });

  it('이름으로 검색한다 (대소문자 무시)', async () => {
    assert.deepEqual(names(await get('?q=ALP')), ['Alpha']);
    assert.deepEqual(names(await get(`?q=${encodeURIComponent('없는게임')}`)), []);
  });

  it('동시 접속자 순으로 정렬할 수 있다', async () => {
    assert.deepEqual(names(await get('?sort=ccu')), ['Bravo', 'Alpha', 'Delta', 'Charlie']);
  });

  it('필터별 개수는 그 필터를 뺀 나머지 조건 기준이다', async () => {
    const res = await get('?genre=Indie');
    // 장르 개수는 장르 필터를 무시하므로 Action 게임 수(3)가 그대로 보인다
    assert.deepEqual(
      res.json.facets.genres.find((f: { value: string }) => f.value === 'Action'),
      {
        value: 'Action',
        count: 3,
      },
    );
    // 연도 개수는 Indie 안에서만 센다: 2023(Charlie), 2019(Bravo)
    assert.deepEqual(res.json.facets.years, [
      { value: 2023, count: 1 },
      { value: 2019, count: 1 },
    ]);
  });

  it('잘못된 조건은 400', async () => {
    for (const query of ['?genre=Nope', '?platform=amiga', '?year=abc', '?year=1800', '?sort=price', '?page=0']) {
      assert.equal((await get(query)).status, 400, query);
    }
    assert.equal((await get(`?q=${'a'.repeat(51)}`)).status, 400);
  });

  it('페이지를 나눈다', async () => {
    const res = await get('?page=2');
    assert.equal(res.json.page, 2);
    assert.deepEqual(res.json.games, []); // 4개뿐이라 30개씩 나누면 2쪽은 비어 있다
    assert.equal(res.json.total, 4);
  });

  it('달러→원 환율을 함께 내려 주고, 6시간 동안은 다시 조회하지 않는다', async () => {
    const first = await get();
    assert.deepEqual(first.json.exchange, { krwPerUsd: 1353.36, date: '2026-09-29' });
    await get();
    assert.equal(fake.callsTo('api.frankfurter.dev').length, 0); // 첫 조회 결과가 캐시에 남아 있다
  });

  it('하루 안에는 SteamSpy를 다시 부르지 않는다', async () => {
    await get();
    const { whenIdle } = await import('../src/services/popular.ts');
    await whenIdle();
    assert.equal(fake.callsTo('steamspy.com').length, 0);
    assert.equal(fake.callsTo('store.steampowered.com').length, 0); // 출시 정보도 이미 다 받았다
  });
});
