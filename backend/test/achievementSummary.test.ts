import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { installFakeFetch, json, type ExternalHandler } from './fakeExternal.ts';
import { startTestServer } from './helpers.ts';

process.env.STEAM_API_KEY = 'test-steam-key';
// 책등 폰트용 게임 분위기 조회는 이 파일의 검증 대상이 아니라서 외부 호출이 나가지 않게 끈다
process.env.GAME_STYLES_DISABLED = '1';

let t: Awaited<ReturnType<typeof startTestServer>>;
let fake: ReturnType<typeof installFakeFetch>;

before(async () => {
  t = await startTestServer();
});
after(() => t.close());
beforeEach(() => {
  mock.method(console, 'warn', () => {});
});
afterEach(() => {
  fake?.restore();
  mock.restoreAll();
});

let seq = 0;
/** 가입한 뒤 Steam 계정이 연동된 것으로 만든다 (연동 절차 자체는 steam.test.ts에서 검증한다) */
async function linked(steamId: string) {
  const c = t.client();
  const res = await c.request('POST', '/api/auth/signup', {
    email: `summary${++seq}@example.com`,
    password: 'password-1234',
    nickname: '통계왕',
  });
  assert.equal(res.status, 201);
  t.db.prepare('UPDATE users SET steam_id = ? WHERE id = ?').run(steamId, res.json.user.id);
  return c;
}

const owned = (games: { appid: number; name: string; playtime_forever: number }[]) =>
  json({ response: { game_count: games.length, games } });

const achievements = (done: number, total: number) =>
  json({
    playerstats: {
      success: true,
      achievements: Array.from({ length: total }, (_, i) => ({
        apiname: `A${i}`,
        achieved: i < done ? 1 : 0,
        unlocktime: i < done ? 1_700_000_000 : 0,
        name: `업적 ${i}`,
        description: '',
      })),
    },
  });

/** 앱 번호별 업적 응답을 돌려주는 외부 API 가짜 */
function steam(
  ownedGames: Parameters<typeof owned>[0],
  perApp: Record<number, () => Response>,
  profileResponse?: Response,
): ExternalHandler {
  return (url) => {
    if (url.pathname === '/IPlayerService/GetOwnedGames/v1/') return profileResponse ?? owned(ownedGames);
    if (url.pathname === '/ISteamUserStats/GetPlayerAchievements/v1/') {
      return perApp[Number(url.searchParams.get('appid'))]?.();
    }
    return undefined;
  };
}

const PATH = '/api/me/steam/achievement-summary';

describe('업적 달성 요약', () => {
  it('로그인하고 Steam을 연동해야 쓸 수 있다', async () => {
    fake = installFakeFetch(t.base, () => undefined);
    assert.equal((await t.client().request('GET', PATH)).status, 401);

    const c = t.client();
    await c.request('POST', '/api/auth/signup', {
      email: `summary-unlinked${++seq}@example.com`,
      password: 'password-1234',
      nickname: '미연동',
    });
    assert.equal((await c.request('GET', PATH)).status, 404);
  });

  it('플레이한 게임만 플레이 시간 순으로 보고, 업적이 있는 게임의 달성 수를 돌려준다', async () => {
    fake = installFakeFetch(
      t.base,
      steam(
        [
          { appid: 1, name: 'Played A', playtime_forever: 600 },
          { appid: 2, name: 'No Achievements', playtime_forever: 500 },
          { appid: 3, name: 'Unplayed', playtime_forever: 0 },
          { appid: 4, name: 'Played B', playtime_forever: 100 },
        ],
        {
          1: () => achievements(4, 10),
          2: () => json({ playerstats: { error: 'no stats', success: false } }, 400),
          4: () => achievements(8, 8),
        },
      ),
    );
    const c = await linked('76561198100000001');

    const res = await c.request('GET', PATH);
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, {
      private: false,
      games: [
        { appId: 1, name: 'Played A', total: 10, achieved: 4 },
        { appId: 4, name: 'Played B', total: 8, achieved: 8 },
      ],
      checked: 3, // 플레이하지 않은 게임은 확인하지 않는다
      hidden: 0,
      failed: 0,
    });
    assert.deepEqual(
      fake
        .callsTo('api.steampowered.com', '/ISteamUserStats/')
        .map((u) => u.searchParams.get('appid'))
        .sort(),
      ['1', '2', '4'],
    );
    assert.ok(!JSON.stringify(res.json).includes('test-steam-key'));
  });

  it('플레이 시간 상위 20개까지만 확인한다', async () => {
    const games = Array.from({ length: 25 }, (_, i) => ({
      appid: i + 1,
      name: `Game ${i + 1}`,
      playtime_forever: 1000 - i, // 앱 번호가 작을수록 오래 했다
    }));
    const perApp = Object.fromEntries(games.map((g) => [g.appid, () => achievements(1, 2)]));
    fake = installFakeFetch(t.base, steam(games, perApp));
    const c = await linked('76561198100000002');

    const res = await c.request('GET', PATH);
    assert.equal(res.json.checked, 20);
    assert.equal(res.json.games.length, 20);
    assert.equal(fake.callsTo('api.steampowered.com', '/ISteamUserStats/').length, 20);
    assert.deepEqual(
      res.json.games.map((g: { appId: number }) => g.appId),
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it('업적이 비공개인 게임과 조회에 실패한 게임을 따로 센다. 실패가 있으면 기억하지 않아 다시 시도한다', async () => {
    let failing = true;
    fake = installFakeFetch(
      t.base,
      steam(
        [
          { appid: 1, name: 'Open', playtime_forever: 300 },
          { appid: 2, name: 'Hidden', playtime_forever: 200 },
          { appid: 3, name: 'Flaky', playtime_forever: 100 },
        ],
        {
          1: () => achievements(1, 4),
          2: () => new Response('forbidden', { status: 403 }),
          3: () => (failing ? new Response('down', { status: 503 }) : achievements(2, 2)),
        },
      ),
    );
    const c = await linked('76561198100000003');

    const first = await c.request('GET', PATH);
    assert.equal(first.status, 200);
    assert.equal(first.json.hidden, 1);
    assert.equal(first.json.failed, 1);
    assert.deepEqual(
      first.json.games.map((g: { name: string }) => g.name),
      ['Open'],
    );

    failing = false;
    const second = await c.request('GET', PATH);
    assert.equal(second.json.failed, 0);
    assert.deepEqual(
      second.json.games.map((g: { name: string }) => g.name),
      ['Open', 'Flaky'],
    );
  });

  it('성공한 결과는 잠시 기억해서 Steam을 다시 부르지 않는다', async () => {
    fake = installFakeFetch(
      t.base,
      steam([{ appid: 1, name: 'Only', playtime_forever: 60 }], { 1: () => achievements(1, 1) }),
    );
    const c = await linked('76561198100000004');

    await c.request('GET', PATH);
    const callsAfterFirst = fake.calls.length;
    const again = await c.request('GET', PATH);
    assert.equal(again.json.games.length, 1);
    assert.equal(fake.calls.length, callsAfterFirst);
  });

  it('게임 세부 정보가 비공개면 private: true', async () => {
    fake = installFakeFetch(t.base, steam([], {}, json({ response: {} })));
    const c = await linked('76561198100000005');
    assert.deepEqual((await c.request('GET', PATH)).json, {
      private: true,
      games: [],
      checked: 0,
      hidden: 0,
      failed: 0,
    });
  });

  it('보유 게임을 가져오지 못하면 502 (API 키는 노출하지 않는다)', async () => {
    fake = installFakeFetch(t.base, steam([], {}, new Response('down', { status: 503 })));
    const c = await linked('76561198100000006');
    const res = await c.request('GET', PATH);
    assert.equal(res.status, 502);
    assert.ok(!JSON.stringify(res.json).includes('test-steam-key'));
  });
});
