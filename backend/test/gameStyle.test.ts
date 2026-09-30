import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { installFakeFetch, json, type ExternalHandler } from './fakeExternal.ts';
import { startTestServer } from './helpers.ts';

process.env.STEAM_API_KEY = 'test-steam-key';
process.env.POPULAR_GAP_MS = '0';

let t: Awaited<ReturnType<typeof startTestServer>>;
let fake: ReturnType<typeof installFakeFetch>;

const OWNED = {
  response: {
    game_count: 3,
    games: [
      { appid: 1245620, name: 'ELDEN RING', playtime_forever: 500 },
      { appid: 1091500, name: 'Cyberpunk 2077', playtime_forever: 300 },
      { appid: 999001, name: 'Unknown Thing', playtime_forever: 1 },
    ],
  },
};

const SPY: Record<string, unknown> = {
  '1245620': { name: 'ELDEN RING', tags: { 'Souls-like': 6994, 'Open World': 5078, 'Dark Fantasy': 4953, RPG: 4707 } },
  '1091500': { name: 'Cyberpunk 2077', tags: { Cyberpunk: 6625, 'Open World': 6081, 'Sci-fi': 4609, RPG: 5037 } },
  // 모르는 앱: name이 null이고 tags가 빈 배열로 온다
  '999001': { name: null, tags: [] },
};

const handler: ExternalHandler = (url) => {
  if (url.pathname === '/IPlayerService/GetOwnedGames/v1/') return json(OWNED);
  if (url.host === 'steamspy.com') return json(SPY[url.searchParams.get('appid')!] ?? { name: null, tags: [] });
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

async function linkedClient() {
  const c = t.client();
  await c.request('POST', '/api/auth/signup', {
    email: 'style@example.com',
    password: 'password-1234',
    nickname: '폰트',
  });
  t.db.prepare("UPDATE users SET steam_id = '76561198000000099' WHERE email = 'style@example.com'").run();
  // 로그인 세션의 사용자 정보에는 steam_id가 이미 반영되어 있지 않을 수 있으니 다시 로그인한다
  const fresh = t.client();
  await fresh.request('POST', '/api/auth/login', { email: 'style@example.com', password: 'password-1234' });
  return fresh;
}

describe('게임 분위기 (derivePersona)', () => {
  it('태그를 분위기로 묶는다', async () => {
    const { derivePersona } = await import('../src/services/gameStyle.ts');
    assert.equal(derivePersona({ 'Souls-like': 6994, 'Dark Fantasy': 4953, RPG: 4707 }), 'fantasy');
    assert.equal(derivePersona({ Cyberpunk: 6625, 'Sci-fi': 4609, 'Open World': 6081 }), 'scifi');
    assert.equal(derivePersona({ Horror: 900, 'Survival Horror': 700, Singleplayer: 1000 }), 'horror');
    assert.equal(derivePersona({ 'Pixel Graphics': 800, Retro: 300, Indie: 900 }), 'retro');
    assert.equal(derivePersona({ 'Farming Sim': 700, Cute: 400, Relaxing: 300 }), 'cute');
    assert.equal(derivePersona({ Racing: 900, Driving: 500, Multiplayer: 300 }), 'sports');
    assert.equal(derivePersona({ Strategy: 900, 'City Builder': 600 }), 'strategy');
    assert.equal(derivePersona({ FPS: 900, Shooter: 800, Multiplayer: 700 }), 'action');
  });

  it('맞는 태그가 뚜렷하지 않거나 태그가 없으면 기본', async () => {
    const { derivePersona } = await import('../src/services/gameStyle.ts');
    assert.equal(derivePersona({}), 'default');
    assert.equal(derivePersona(null), 'default');
    assert.equal(derivePersona({ Indie: 1000, Singleplayer: 900, Cute: 5 }), 'default'); // 최다 태그의 10% 미만
  });

  it('여러 분위기가 섞이면 투표 수 합이 가장 큰 쪽', async () => {
    const { derivePersona } = await import('../src/services/gameStyle.ts');
    // Cyberpunk 2077: 사이버펑크·SF 표가 액션(FPS)보다 많다
    assert.equal(derivePersona({ Cyberpunk: 6625, 'Sci-fi': 4609, FPS: 4591, Shooter: 300 }), 'scifi');
  });
});

describe('보유 게임 응답의 분위기', () => {
  it('처음에는 모르는 채(null)로 내려가고, 백그라운드에서 알아낸 뒤에는 분위기가 붙는다', async () => {
    const c = await linkedClient();
    const first = await c.request('GET', '/api/me/steam/games');
    assert.equal(first.status, 200);
    assert.equal(first.json.stylesPending, 3);
    assert.ok(first.json.games.every((g: { persona: string | null }) => g.persona === null));

    const { whenStylesIdle } = await import('../src/services/gameStyle.ts');
    await whenStylesIdle();

    const second = await c.request('GET', '/api/me/steam/games');
    const persona = (name: string) => second.json.games.find((g: { name: string }) => g.name === name).persona;
    assert.equal(persona('ELDEN RING'), 'fantasy');
    assert.equal(persona('Cyberpunk 2077'), 'scifi');
    assert.equal(persona('Unknown Thing'), 'default'); // 모르는 앱도 기록해서 다시 묻지 않는다
    assert.equal(second.json.stylesPending, 0);
  });

  it('한 번 알아낸 게임은 SteamSpy에 다시 묻지 않는다', async () => {
    const c = await linkedClient();
    await c.request('GET', '/api/me/steam/games');
    const { whenStylesIdle } = await import('../src/services/gameStyle.ts');
    await whenStylesIdle();
    assert.equal(fake.callsTo('steamspy.com').length, 0);
  });

  it('SteamSpy 호출은 초당 한도를 지키도록 게임마다 따로 한 번씩', async () => {
    const c = await linkedClient();
    t.db.prepare('DELETE FROM game_styles').run();
    await c.request('GET', '/api/me/steam/games');
    const { whenStylesIdle } = await import('../src/services/gameStyle.ts');
    await whenStylesIdle();
    const asked = fake.callsTo('steamspy.com').map((u) => u.searchParams.get('appid'));
    assert.deepEqual([...asked].sort(), ['1091500', '1245620', '999001']);
    assert.ok(fake.callsTo('steamspy.com').every((u) => u.searchParams.get('request') === 'appdetails'));
  });
});
