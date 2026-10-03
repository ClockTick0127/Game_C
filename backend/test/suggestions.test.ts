import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it, mock } from 'node:test';
import { installFakeFetch, json, rawgGame } from './fakeExternal.ts';
import { startTestServer } from './helpers.ts';

process.env.STEAM_API_KEY = 'test-steam-key';
// 분위기를 알아내는 SteamSpy 조회는 이 파일의 검증 대상이 아니라서 외부 호출이 나가지 않게 끈다
process.env.GAME_STYLES_DISABLED = '1';

let t: Awaited<ReturnType<typeof startTestServer>>;
let fake: ReturnType<typeof installFakeFetch>;
let owned: { appid: number; name: string; playtime_forever: number }[] = [];
let steamStatus = 200;

const dateKey = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const scifi = [{ slug: 'sci-fi', name: 'Sci-fi' }];
const cute = [{ slug: 'cute', name: 'Cute' }];
/** 인기순(-added)으로 이미 정렬되어 온 목록. 앞쪽일수록 인기 있다 */
const RELEASES = [
  rawgGame({ id: 1, name: 'Space Epic', released: dateKey(5), tags: scifi }),
  rawgGame({ id: 2, name: 'Cozy Farm', released: dateKey(6), tags: cute }),
  rawgGame({ id: 3, name: 'Star Tactics', released: dateKey(10), tags: scifi }),
  rawgGame({ id: 4, name: 'Mecha Rush', released: dateKey(20), tags: scifi }),
  rawgGame({ id: 5, name: 'Old Nebula', released: dateKey(-10), tags: scifi }), // 최근에 나온 게임
  rawgGame({ id: 6, name: 'Ancient Relic', released: dateKey(-200), tags: scifi }), // 너무 오래된 게임(기간 밖)
  rawgGame({ id: 7, name: 'Orbit Break', released: dateKey(30), tags: scifi }),
  rawgGame({ id: 8, name: 'Pixel Pals', released: dateKey(8), tags: cute }),
];

before(async () => {
  t = await startTestServer({ rawgKey: 'test-rawg-key' });
  fake = installFakeFetch(t.base, (url) => {
    if (url.host === 'api.rawg.io') {
      const [from, to] = url.searchParams.get('dates')!.split(',');
      // RAWG처럼 요청한 기간에 출시되는 게임만 돌려준다
      const results = RELEASES.filter((g) => g.released! >= from! && g.released! <= to!);
      return json({ count: results.length, next: null, results });
    }
    if (url.pathname === '/IPlayerService/GetOwnedGames/v1/') {
      if (steamStatus !== 200) return new Response('down', { status: steamStatus });
      return json({ response: { game_count: owned.length, games: owned } });
    }
    return undefined;
  });
});
after(() => {
  fake.restore();
  return t.close();
});
beforeEach(() => {
  steamStatus = 200;
  mock.method(console, 'warn', () => {});
});

let seq = 0;
async function linked(personaByApp: Record<number, string>, ownedGames = owned) {
  owned = ownedGames;
  const insert = t.db.prepare(
    'INSERT INTO game_styles (appid, persona, checked_at) VALUES (?, ?, 0) ON CONFLICT (appid) DO UPDATE SET persona = excluded.persona',
  );
  for (const [appid, persona] of Object.entries(personaByApp)) insert.run(Number(appid), persona);
  const c = t.client();
  const res = await c.request('POST', '/api/auth/signup', {
    email: `suggest${++seq}@example.com`,
    password: 'password-1234',
    nickname: '추천러',
  });
  t.db
    .prepare('UPDATE users SET steam_id = ? WHERE id = ?')
    .run(`7656119666000${String(seq).padStart(4, '0')}`, res.json.user.id);
  return c;
}

const ids = (res: { json: { games: { id: number }[] } }) => res.json.games.map((g) => g.id);
const sixScifi = (base: number) =>
  Array.from({ length: 6 }, (_, i) => ({ appid: base + i, name: `Owned ${base + i}`, playtime_forever: 600 }));

describe('GET /api/games/suggestions', () => {
  it('로그인하지 않으면 인기 있는 예정작만 인기순으로 준다 (이미 나온 게임은 뺀다)', async () => {
    const res = await t.client().request('GET', '/api/games/suggestions');
    assert.equal(res.status, 200);
    assert.equal(res.json.personalized, false);
    assert.deepEqual(res.json.liked, []);
    // 예정작만, 한 달 안에서의 인기순(목록 앞쪽이 인기 있음). 5(최근 출시)와 6(기간 밖)은 없다
    assert.ok(!ids(res).includes(5) && !ids(res).includes(6));
    assert.equal(ids(res).length, 6);
    assert.ok(res.headers.get('cache-control')?.includes('no-store'));
  });

  it('Steam을 연동했고 취향을 알면 그 분위기의 신작·예정작을 고른다 (이미 가진 게임은 뺀다)', async () => {
    const own = sixScifi(8100);
    own.push({ appid: 8199, name: 'Space Epic', playtime_forever: 100 }); // 추천 후보와 같은 이름을 이미 가졌다
    const c = await linked(Object.fromEntries(sixScifi(8100).map((g) => [g.appid, 'scifi'])), own);
    const res = await c.request('GET', '/api/games/suggestions');

    assert.equal(res.json.personalized, true);
    assert.deepEqual(res.json.liked, ['scifi']);
    const got = ids(res);
    assert.ok(!got.includes(1), '이미 가진 Space Epic은 추천하지 않는다');
    assert.ok(!got.includes(2) && !got.includes(8), 'SF가 아닌 게임은 취향 추천에 없다');
    assert.ok(got.includes(3) && got.includes(4) && got.includes(7));
    assert.ok(got.includes(5), '최근에 나온 SF도 추천한다');
    assert.ok(!got.includes(6), '기간 밖의 오래된 게임은 없다');
  });

  it('취향에 맞는 게임이 4개 미만이면 취향 추천이라 내세우지 않고 인기 예정작을 보여 준다', async () => {
    const own = sixScifi(8200);
    // 후보 중 SF는 Star Tactics, Mecha Rush, Old Nebula, Orbit Break 4개뿐이라, 이 중 둘을 이미 가진 것으로 만든다
    own.push(
      { appid: 8298, name: 'Star Tactics', playtime_forever: 1 },
      { appid: 8299, name: 'Mecha Rush', playtime_forever: 1 },
    );
    const c = await linked(Object.fromEntries(sixScifi(8200).map((g) => [g.appid, 'scifi'])), own);
    const res = await c.request('GET', '/api/games/suggestions');
    assert.equal(res.json.personalized, false);
    assert.deepEqual(res.json.liked, []);
    assert.ok(ids(res).length > 0);
  });

  it('분석한 보유 게임이 적어 취향을 믿을 수 없으면 인기 예정작을 준다', async () => {
    const c = await linked({ 8301: 'scifi' }, sixScifi(8300));
    const res = await c.request('GET', '/api/games/suggestions');
    assert.equal(res.json.personalized, false);
  });

  it('Steam 조회가 실패해도 인기 예정작으로 응답한다', async () => {
    const c = await linked({}, sixScifi(8400));
    steamStatus = 503;
    const res = await c.request('GET', '/api/games/suggestions');
    assert.equal(res.status, 200);
    assert.equal(res.json.personalized, false);
    assert.ok(ids(res).length > 0);
  });
});
