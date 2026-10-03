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
      currentPlayers: null, // 접속자 수 API가 응답하지 않은 경우
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
      details: {
        description: null,
        developers: [],
        publishers: [],
        tags: [],
        ageRating: null,
        playtimeHours: null,
        website: null,
        steam: null,
      },
      related: null, // DLC·시리즈 요청은 이 테스트에서 응답하지 않았다
      ios: null,
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

  it('소개·제작 정보는 Steam(한국어)을 우선하고 RAWG 정보로 보충한다', async () => {
    withExternal((url) => {
      if (url.pathname === '/api/games/609/stores')
        return json({ results: [{ store_id: 1, url: 'https://store.steampowered.com/app/5/' }] });
      if (url.pathname === '/api/games/609') {
        return json({
          name: 'Rich Game',
          platforms: [{ platform: { slug: 'pc' } }],
          description_raw: 'English description',
          developers: [{ name: 'Dev EN' }],
          publishers: [{ name: 'Pub EN' }],
          tags: [
            { name: 'Roguelike', language: 'eng' },
            { name: 'Рогалик', language: 'rus' },
            { name: 'Indie', language: 'eng' },
          ],
          esrb_rating: { name: 'Teen' },
          playtime: 12,
          website: 'http://insecure.example.com',
        });
      }
      if (url.pathname === '/appreviews/5') return json(steamReviews);
      if (url.pathname === '/api/appdetails') {
        assert.equal(url.searchParams.get('cc'), 'kr');
        assert.equal(url.searchParams.get('l'), 'koreana');
        return json({
          '5': {
            success: true,
            data: {
              short_description: '한국어 <b>소개</b> &amp; 설명',
              developers: ['개발사'],
              publishers: [],
              website: 'https://rich.example.com/',
              is_free: false,
              price_overview: { initial_formatted: '₩30,000', final_formatted: '₩24,000', discount_percent: 20 },
              categories: [
                { description: '싱글 플레이어' },
                { description: 'Steam 도전 과제' },
                { description: '싱글 플레이어' },
              ],
              supported_languages:
                'English<strong>*</strong>, 한국어, 日本語<br><strong>*</strong>음성이 지원되는 언어',
              release_date: { coming_soon: false, date: '2026년 9월 30일' },
              screenshots: [
                { path_thumbnail: 'https://cdn.example.com/1t.jpg', path_full: 'https://cdn.example.com/1.jpg' },
                { path_full: 'https://cdn.example.com/2.jpg' }, // 썸네일이 없으면 원본을 쓴다
                { path_full: 'http://cdn.example.com/3.jpg' },
                { path_full: 'javascript:alert(1)' },
              ],
            },
          },
        });
      }
      return undefined;
    });
    const res = await get('/api/games/609/store-info');

    assert.deepEqual(res.json.details, {
      description: '한국어 소개 & 설명',
      developers: ['개발사'],
      publishers: ['Pub EN'], // Steam에 없으면 RAWG 값
      tags: ['Roguelike', 'Indie'], // 영어 태그만
      ageRating: 'Teen',
      playtimeHours: 12,
      website: 'https://rich.example.com/', // Steam의 https 주소
      steam: {
        price: { free: false, final: '₩24,000', initial: '₩30,000', discountPercent: 20 },
        categories: ['싱글 플레이어', 'Steam 도전 과제'],
        languages: ['English', '한국어', '日本語'],
        koreanSupport: true,
        releaseText: '2026년 9월 30일',
        screenshots: [
          { thumbnail: 'https://cdn.example.com/1t.jpg', full: 'https://cdn.example.com/1.jpg' },
          { thumbnail: 'https://cdn.example.com/2.jpg', full: 'https://cdn.example.com/2.jpg' },
        ], // https만
      },
    });
  });

  it('Steam이 없으면 RAWG 설명을 길이 제한해 쓰고, http 웹사이트는 버린다', async () => {
    withExternal((url) => {
      if (url.pathname === '/api/games/610/stores') return json({ results: [] });
      if (url.pathname === '/api/games/610')
        return json({
          name: 'Console Only',
          platforms: [{ platform: { slug: 'playstation5' } }],
          description_raw: 'a'.repeat(800),
          website: 'http://insecure.example.com',
          playtime: 0,
        });
      return undefined;
    });
    const details = (await get('/api/games/610/store-info')).json.details;

    assert.equal(details.description.length, 501); // 500자 + …
    assert.ok(details.description.endsWith('…'));
    assert.equal(details.website, null);
    assert.equal(details.playtimeHours, null); // 0은 데이터 없음
    assert.equal(details.steam, null);
  });

  it('RAWG의 영어 설명은 한국어로 번역해 내려 주고, 번역이 안 되면 영어 그대로 둔다', async () => {
    let translateUp = true;
    withExternal((url, init) => {
      if (url.host === 'translate.googleapis.com') {
        if (!translateUp) return json({}, 503);
        // 줄바꿈은 공백으로 펴서 보낸다
        assert.equal((init?.body as URLSearchParams).get('q'), 'A dark world. Hard combat.');
        return json([[['어두운 세계. 어려운 전투.', 'A dark world. Hard combat.']]]);
      }
      if (url.pathname === '/api/games/612/stores') return json({ results: [] });
      if (url.pathname === '/api/games/612')
        return json({
          name: 'Console Only',
          platforms: [{ platform: { slug: 'playstation5' } }],
          description_raw: 'A dark world.\nHard combat.',
        });
      return undefined;
    });
    assert.equal((await get('/api/games/612/store-info')).json.details.description, '어두운 세계. 어려운 전투.');

    translateUp = false;
    // 위 결과는 캐시되므로 다른 게임으로 확인한다
    withExternal((url) => {
      if (url.host === 'translate.googleapis.com') return json({}, 503);
      if (url.pathname === '/api/games/613/stores') return json({ results: [] });
      if (url.pathname === '/api/games/613')
        return json({ name: 'X', platforms: [], description_raw: 'Only English here.' });
      return undefined;
    });
    assert.equal((await get('/api/games/613/store-info')).json.details.description, 'Only English here.');
  });

  it('무료 게임과 한국어 미지원 게임을 구분한다', async () => {
    withExternal((url) => {
      if (url.pathname === '/api/games/611/stores')
        return json({ results: [{ store_id: 1, url: 'https://store.steampowered.com/app/6/' }] });
      if (url.pathname === '/api/games/611') return json({ name: 'Free', platforms: [] });
      if (url.pathname === '/appreviews/6') return json(steamReviews);
      if (url.pathname === '/api/appdetails')
        return json({ '6': { success: true, data: { is_free: true, supported_languages: 'English, French' } } });
      return undefined;
    });
    const steam = (await get('/api/games/611/store-info')).json.details.steam;

    assert.deepEqual(steam.price, { free: true, final: null, initial: null, discountPercent: 0 });
    assert.equal(steam.koreanSupport, false);
    assert.deepEqual(steam.languages, ['English', 'French']);
  });

  it('RAWG 게임 정보를 못 가져와도 스토어 링크는 돌려주고, 그 결과는 캐시하지 않는다', async () => {
    let detailFails = true;
    const f = withExternal((url) => {
      if (url.pathname === '/api/games/612/stores')
        return json({ results: [{ store_id: 3, url: 'https://store.playstation.com/z' }] });
      if (url.pathname === '/api/games/612')
        return detailFails ? new Response('down', { status: 500 }) : json({ name: 'Flaky', platforms: [] });
      return undefined;
    });
    const first = await get('/api/games/612/store-info');
    assert.equal(first.status, 200);
    assert.equal(first.json.stores.length, 1);
    assert.equal(first.json.details, null);

    detailFails = false;
    const second = await get('/api/games/612/store-info');
    assert.notEqual(second.json.details, null); // 실패한 결과가 캐시에 남지 않아 다시 시도했다
    assert.equal(f.callsTo(RAWG).filter((u) => u.pathname === '/api/games/612').length, 2);
  });

  it('DLC와 같은 시리즈 게임을 보여주고, 성인 게임은 거르고, 개수를 제한한다', async () => {
    withExternal((url) => {
      if (url.pathname === '/api/games/613/stores') return json({ results: [] });
      if (url.pathname === '/api/games/613') return json({ name: 'Series Game', platforms: [] });
      if (url.pathname === '/api/games/613/additions') {
        return json({
          results: [
            rawgGame({ id: 1, name: 'Expansion', released: '2027-01-01' }),
            rawgGame({ id: 2, name: '성인 DLC', tags: [{ slug: 'hentai' }] }),
            rawgGame({ id: 3, name: 'Unreleased DLC', released: null }),
          ],
        });
      }
      if (url.pathname === '/api/games/613/game-series') {
        return json({ results: Array.from({ length: 10 }, (_, i) => rawgGame({ id: 100 + i, name: `Sequel ${i}` })) });
      }
      return undefined;
    });
    const related = (await get('/api/games/613/store-info')).json.related;

    assert.deepEqual(related.additions, [
      { id: 1, name: 'Expansion', released: '2027-01-01' },
      { id: 3, name: 'Unreleased DLC', released: null },
    ]);
    assert.equal(related.series.length, 6);
  });

  it('현재 접속자 수는 6시간 캐시와 별개로 짧게 캐시한다', async () => {
    let players = 100;
    const f = withExternal((url) => {
      if (url.pathname === '/api/games/615/stores')
        return json({ results: [{ store_id: 1, url: 'https://store.steampowered.com/app/8/' }] });
      if (url.pathname === '/api/games/615') return json({ name: 'Live', platforms: [] });
      if (/^\/api\/games\/615\/(additions|game-series)$/.test(url.pathname)) return json({ results: [] });
      if (url.pathname === '/appreviews/8') return json(steamReviews);
      if (url.pathname === '/api/appdetails') return json({ '8': { success: true, data: {} } });
      if (url.host === 'api.steampowered.com') return json({ response: { player_count: players, result: 1 } });
      return undefined;
    });
    assert.equal((await get('/api/games/615/store-info')).json.steam.currentPlayers, 100);

    players = 999; // 5분 안에는 다시 묻지 않는다
    assert.equal((await get('/api/games/615/store-info')).json.steam.currentPlayers, 100);
    assert.equal(f.callsTo('api.steampowered.com').length, 1);
  });

  it('접속자 수를 못 가져와도 응답은 정상이다', async () => {
    withExternal((url) => {
      if (url.pathname === '/api/games/616/stores')
        return json({ results: [{ store_id: 1, url: 'https://store.steampowered.com/app/9/' }] });
      if (url.pathname === '/api/games/616') return json({ name: 'No Players', platforms: [] });
      if (/^\/api\/games\/616\/(additions|game-series)$/.test(url.pathname)) return json({ results: [] });
      if (url.pathname === '/appreviews/9') return json(steamReviews);
      if (url.pathname === '/api/appdetails') return json({ '9': { success: true, data: {} } });
      if (url.host === 'api.steampowered.com') return json({ response: { result: 42 } });
      return undefined;
    });
    const res = await get('/api/games/616/store-info');
    assert.equal(res.status, 200);
    assert.equal(res.json.steam.currentPlayers, null); // result가 1이 아니면 접속자 수 없음
  });

  describe('iOS App Store (iTunes)', () => {
    const ITUNES = 'itunes.apple.com';
    const usApp = (overrides: Record<string, unknown> = {}) => ({
      trackId: 111,
      trackName: 'Mobile Hero',
      primaryGenreName: 'Games',
      artistName: 'Hero Studio',
      sellerName: 'Hero Studio LTD',
      ...overrides,
    });
    const krApp = {
      trackId: 111,
      trackName: '모바일 히어로',
      trackViewUrl: 'https://apps.apple.com/kr/app/%EB%AA%A8%EB%B0%94%EC%9D%BC/id111?uo=4',
      primaryGenreName: 'Games',
      sellerName: 'Hero Studio LTD',
      formattedPrice: '무료',
      averageUserRating: 4.11319,
      userRatingCount: 44429,
      contentAdvisoryRating: '12+',
      languageCodesISO2A: ['EN', 'KO'],
      fileSizeBytes: '3766125568',
      description: '한국어 앱스토어 소개',
      screenshotUrls: ['https://is1-ssl.mzstatic.com/a.png', 'http://insecure.example.com/b.png'],
    };

    /** 게임 n번의 RAWG 응답(플랫폼 지정)과 iTunes 응답을 가짜로 만든다 */
    function fakeIos(
      n: number,
      platformSlug: string,
      itunes: ExternalHandler,
      storeLinks: { store_id: number; url: string }[] = [],
    ) {
      return withExternal((url, init) => {
        if (url.pathname === `/api/games/${n}/stores`) return json({ results: storeLinks });
        if (url.pathname === `/api/games/${n}`)
          return json({
            name: 'Mobile Hero',
            platforms: [{ platform: { slug: platformSlug } }],
            description_raw: 'English RAWG description',
            developers: [{ name: 'Hero Studio' }],
          });
        if (new RegExp(`^/api/games/${n}/(additions|game-series)$`).test(url.pathname)) return json({ results: [] });
        if (url.host === ITUNES) return itunes(url, init);
        return undefined;
      });
    }

    const okItunes: ExternalHandler = (url) => {
      if (url.pathname === '/search') return json({ results: [usApp()] });
      if (url.pathname === '/lookup') return json({ results: [krApp] });
      return undefined;
    };

    it('미국 스토어에서 영어 제목으로 찾고, 한국 스토어 정보(가격·평점·소개)를 보여준다', async () => {
      const f = fakeIos(620, 'ios', okItunes);
      const res = await get('/api/games/620/store-info');

      assert.deepEqual(res.json.ios, {
        url: 'https://apps.apple.com/kr/app/%EB%AA%A8%EB%B0%94%EC%9D%BC/id111', // 추적 파라미터 제거
        name: '모바일 히어로',
        price: '무료',
        rating: 4.1,
        ratingCount: 44429,
        seller: 'Hero Studio LTD',
        ageRating: '12+',
        koreanSupport: true,
        sizeMb: 3766,
        storefront: 'KR',
        screenshots: ['https://is1-ssl.mzstatic.com/a.png'], // https만
      });
      assert.equal(res.json.details.description, '한국어 앱스토어 소개'); // RAWG 영어 설명보다 우선
      assert.deepEqual(
        res.json.stores.map((s: { slug: string }) => s.slug),
        ['apple-appstore'],
      );
      const search = f.callsTo(ITUNES, '/search')[0]!;
      assert.equal(search.searchParams.get('country'), 'us');
      assert.equal(f.callsTo(ITUNES, '/lookup')[0]!.searchParams.get('country'), 'kr');
    });

    it('RAWG가 App Store 링크를 알면 이름 검색 없이 그 앱 번호로 정확히 찾는다', async () => {
      const f = fakeIos(
        627,
        'ios', // 이름 검색으로는 못 찾는 게임(미국 스토어 제목이 다르다)이라도 링크로 찾는다
        (url) => (url.pathname === '/lookup' ? json({ results: [krApp] }) : undefined),
        [{ store_id: 4, url: 'https://apps.apple.com/us/app/genshin-impact/id1517783697' }],
      );
      const res = await get('/api/games/627/store-info');

      assert.equal(res.json.ios.name, '모바일 히어로');
      assert.equal(f.callsTo(ITUNES, '/search').length, 0);
      assert.equal(f.callsTo(ITUNES, '/lookup')[0]!.searchParams.get('id'), '1517783697');
      // RAWG 링크와 App Store 정보가 함께 있어도 스토어 버튼은 하나다
      assert.equal(res.json.stores.filter((st: { slug: string }) => st.slug === 'apple-appstore').length, 1);
    });

    it('앱 번호로 한국 스토어에 없으면 미국 스토어에서 다시 찾는다', async () => {
      fakeIos(
        628,
        'ios',
        (url) => {
          if (url.pathname !== '/lookup') return undefined;
          return json({
            results:
              url.searchParams.get('country') === 'kr'
                ? []
                : [{ ...krApp, trackViewUrl: 'https://apps.apple.com/us/app/x/id111', formattedPrice: '$1.99' }],
          });
        },
        [{ store_id: 4, url: 'https://apps.apple.com/us/app/x/id111' }],
      );
      const ios = (await get('/api/games/628/store-info')).json.ios;
      assert.equal(ios.storefront, 'US');
      assert.equal(ios.price, '$1.99');
    });

    it('iOS 게임이 아니면 iTunes를 부르지 않는다', async () => {
      const f = fakeIos(621, 'playstation5', okItunes);
      const res = await get('/api/games/621/store-info');

      assert.equal(res.json.ios, null);
      assert.equal(f.callsTo(ITUNES).length, 0);
    });

    it('게임 카테고리가 아니거나 제목이 다른 앱은 무시한다', async () => {
      fakeIos(622, 'ios', (url) => {
        if (url.pathname === '/search')
          return json({
            results: [
              usApp({ trackId: 1, primaryGenreName: 'Entertainment' }), // 제목은 같지만 게임이 아님
              usApp({ trackId: 2, trackName: 'Mobile Hero Wallpapers' }),
            ],
          });
        return undefined;
      });
      const res = await get('/api/games/622/store-info');
      assert.equal(res.status, 200);
      assert.equal(res.json.ios, null);
    });

    it('부제만 다른 앱은 제작사가 RAWG 정보와 겹칠 때만 인정한다', async () => {
      fakeIos(623, 'ios', (url) => {
        if (url.pathname === '/search')
          return json({
            results: [
              usApp({
                trackId: 3,
                trackName: 'Mobile Hero: Other Publisher Game',
                artistName: 'Unrelated Inc',
                sellerName: 'Unrelated Inc',
              }),
              usApp({ trackId: 111, trackName: 'Mobile Hero - Idle RPG' }),
            ],
          });
        if (url.pathname === '/lookup') return json({ results: [krApp] });
        return undefined;
      });
      const res = await get('/api/games/623/store-info');
      assert.equal(res.json.ios.name, '모바일 히어로'); // trackId 111(제작사 일치)이 선택됐다
    });

    it('한국 스토어에 없는 앱은 미국 스토어 정보로 대신한다', async () => {
      fakeIos(624, 'ios', (url) => {
        if (url.pathname === '/search')
          return json({
            results: [
              usApp({ trackViewUrl: 'https://apps.apple.com/us/app/mobile-hero/id111', formattedPrice: '$4.99' }),
            ],
          });
        if (url.pathname === '/lookup') return json({ results: [] });
        return undefined;
      });
      const ios = (await get('/api/games/624/store-info')).json.ios;
      assert.equal(ios.storefront, 'US');
      assert.equal(ios.price, '$4.99');
      assert.equal(ios.rating, null); // 평가가 없으면 null
    });

    it('App Store 주소가 아닌 링크는 버려 앱 정보 자체를 만들지 않는다', async () => {
      fakeIos(625, 'ios', (url) => {
        if (url.pathname === '/search') return json({ results: [usApp()] });
        if (url.pathname === '/lookup')
          return json({ results: [{ ...krApp, trackViewUrl: 'https://evil.example.com/app/id111' }] });
        return undefined;
      });
      const res = await get('/api/games/625/store-info');
      assert.equal(res.json.ios, null);
      assert.equal(res.json.stores.length, 0);
    });

    it('iTunes가 실패해도 응답은 정상이고, 그 결과는 캐시하지 않는다', async () => {
      let down = true;
      const f = fakeIos(626, 'ios', (url) => {
        if (down) return new Response('down', { status: 503 });
        return okItunes(url);
      });
      const first = await get('/api/games/626/store-info');
      assert.equal(first.status, 200);
      assert.equal(first.json.ios, null);

      down = false;
      const second = await get('/api/games/626/store-info');
      assert.equal(second.json.ios.storefront, 'KR'); // 실패한 결과가 캐시에 남지 않아 다시 시도했다
      assert.ok(f.callsTo(ITUNES, '/search').length >= 2);
    });
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
      if (/^\/api\/games\/608\/(additions|game-series)$/.test(url.pathname)) return json({ results: [] });
      return undefined;
    });
    await get('/api/games/608/store-info');
    const after = f.calls.length;
    await get('/api/games/608/store-info');
    assert.equal(f.calls.length, after);
  });
});

describe('GET /api/games/find — 전체 게임 검색', () => {
  it('로그인 없이 쓸 수 있고, 성인 게임을 빼고 출시일이 없는 게임은 빈 문자열로 내려준다', async () => {
    const f = withExternal((url) =>
      url.pathname === '/api/games'
        ? json({
            results: [
              rawgGame({ id: 901, name: 'Find Me', released: '2020-05-01' }),
              rawgGame({ id: 902, name: 'Find Me 2', released: null }),
              rawgGame({ id: 903, name: '성인 게임', released: '2021-01-01', tags: [{ slug: 'hentai' }] }),
            ],
          })
        : undefined,
    );
    const res = await get('/api/games/find?q=Find%20Me');
    assert.equal(res.status, 200);
    const games = res.json.games as { id: number; released: string }[];
    assert.deepEqual(
      games.map((g) => [g.id, g.released]),
      [
        [901, '2020-05-01'],
        [902, ''],
      ],
    );
    assert.equal(f.callsTo(RAWG)[0]!.searchParams.get('search'), 'Find Me');
    assert.equal(f.callsTo(RAWG)[0]!.searchParams.get('page_size'), '20');
  });

  it('같은 검색어는 캐시해서 RAWG를 다시 부르지 않는다', async () => {
    const f = withExternal(() =>
      json({ results: [rawgGame({ id: 911, name: 'Cached Search', released: '2020-05-01' })] }),
    );
    await get('/api/games/find?q=Cached%20Search');
    await get('/api/games/find?q=cached%20search');
    assert.equal(f.callsTo(RAWG).length, 1);
  });

  it('검색어가 없거나 100자를 넘으면 400', async () => {
    assert.equal((await get('/api/games/find')).status, 400);
    assert.equal((await get('/api/games/find?q=%20%20')).status, 400);
    assert.equal((await get(`/api/games/find?q=${'a'.repeat(101)}`)).status, 400);
  });
});

describe('GET /api/games — 분위기(persona)', () => {
  it('RAWG 태그·장르 이름으로 분위기를 짐작해 내려준다 (흔한 "액션"보다 구체적인 분위기가 우선)', async () => {
    withExternal(() =>
      json({
        count: 4,
        next: null,
        results: [
          rawgGame({
            id: 8101,
            name: 'Scary One',
            released: '2027-03-01',
            tags: [
              { slug: 'horror', name: 'Horror' },
              { slug: 'shooter', name: 'Shooter' },
              { slug: 'action', name: 'Action' },
            ],
            genres: [{ id: 4, name: 'Action' }],
          }),
          rawgGame({
            id: 8102,
            name: 'Space One',
            released: '2027-03-02',
            tags: [{ slug: 'sci-fi' }, { slug: 'cyberpunk' }],
            genres: [{ id: 2, name: 'Shooter' }],
          }),
          rawgGame({
            id: 8103,
            name: 'Racer One',
            released: '2027-03-03',
            tags: [],
            genres: [{ id: 1, name: 'Racing' }],
          }),
          rawgGame({
            id: 8104,
            name: 'Puzzle One',
            released: '2027-03-04',
            tags: [],
            genres: [{ id: 7, name: 'Puzzle' }],
          }),
        ],
      }),
    );
    const res = await get('/api/games?start=2027-03-01&end=2027-03-31');
    const byId = Object.fromEntries(
      (res.json.games as { id: number; persona: string | null }[]).map((g) => [g.id, g.persona]),
    );
    assert.deepEqual(byId, { 8101: 'horror', 8102: 'scifi', 8103: 'sports', 8104: null });
  });
});
