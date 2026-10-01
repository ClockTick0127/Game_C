import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { installFakeFetch, json } from './fakeExternal.ts';
import { startTestServer } from './helpers.ts';

process.env.STEAM_API_KEY = 'test-steam-key';

let t: Awaited<ReturnType<typeof startTestServer>>;
let fake: ReturnType<typeof installFakeFetch>;

const owned = [
  { appid: 10, name: 'Short', playtime_forever: 30 },
  { appid: 20, name: 'Long', playtime_forever: 600 },
];

before(async () => {
  t = await startTestServer();
  fake = installFakeFetch(t.base, (url) => {
    if (url.pathname === '/IPlayerService/GetOwnedGames/v1/')
      return json({ response: { game_count: 2, games: owned } });
    // 직접 추가한 게임의 Steam 앱 번호 찾기: 없는 것으로 답한다
    if (url.host === 'store.steampowered.com') return json({ items: [] });
    return undefined;
  });
});
after(() => {
  fake.restore();
  return t.close();
});

let seq = 0;
/** 가입한 사용자. Steam 계정을 연동한 것으로 처리한다 */
async function signedUp(nickname: string) {
  const c = t.client();
  const res = await c.request('POST', '/api/auth/signup', {
    email: `showcase${++seq}@example.com`,
    password: 'password-1234',
    nickname,
  });
  assert.equal(res.status, 201);
  t.db.prepare('UPDATE users SET steam_id = ? WHERE id = ?').run(`7656119800000010${seq}`, res.json.user.id);
  return c;
}

const showcase = (c: ReturnType<typeof t.client>, nickname: string) =>
  c.request('GET', `/api/profiles/${encodeURIComponent(nickname)}/showcase`);

describe('진열장 공개 여부', () => {
  it('처음에는 비공개이고, 로그인 없이는 바꿀 수 없다', async () => {
    const c = await signedUp('처음유저');
    assert.equal((await c.request('GET', '/api/auth/me')).json.user.profilePublic, false);
    assert.equal((await t.client().request('PUT', '/api/me/profile-visibility', { public: true })).status, 401);
  });

  it('boolean이 아닌 값은 400', async () => {
    const c = await signedUp('값검사');
    assert.equal((await c.request('PUT', '/api/me/profile-visibility', { public: 'yes' })).status, 400);
    assert.equal((await c.request('PUT', '/api/me/profile-visibility', {})).status, 400);
  });

  it('공개하면 로그인 없이 볼 수 있고, 숨기면 다시 404', async () => {
    const c = await signedUp('토글유저');
    await c.request('PUT', '/api/me/library-order', { order: [20] });

    assert.equal((await showcase(t.client(), '토글유저')).status, 404);

    const on = await c.request('PUT', '/api/me/profile-visibility', { public: true });
    assert.equal(on.json.user.profilePublic, true);
    const res = await showcase(t.client(), '토글유저');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');

    await c.request('PUT', '/api/me/profile-visibility', { public: false });
    assert.equal((await showcase(t.client(), '토글유저')).status, 404);
  });
});

describe('공개 진열장 내용', () => {
  it('꽂은 순서대로 게임 이름·플레이 시간·상태·별점만 내려 주고, 메모·이메일·Steam 번호는 내려 주지 않는다', async () => {
    const c = await signedUp('자랑왕');
    await c.request('PUT', '/api/me/library-order', { order: [20, 10, 999] }); // 999: 더 이상 갖고 있지 않은 게임
    await c.request('PUT', '/api/me/game-logs/20', { status: 'cleared', rating: 5, note: '비밀 메모' });
    await c.request('PUT', '/api/me/profile-visibility', { public: true });

    const res = await showcase(t.client(), '자랑왕');
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, {
      nickname: '자랑왕',
      games: [
        {
          appId: 20,
          name: 'Long',
          playtimeMinutes: 600,
          custom: false,
          image: null,
          steamAppId: null,
          status: 'cleared',
          rating: 5,
        },
        {
          appId: 10,
          name: 'Short',
          playtimeMinutes: 30,
          custom: false,
          image: null,
          steamAppId: null,
          status: null,
          rating: null,
        },
      ],
    });
    const text = JSON.stringify(res.json);
    for (const secret of ['비밀 메모', 'showcase', 'password', '76561198']) assert.ok(!text.includes(secret), secret);
  });

  it('직접 추가한 게임도 전시된다', async () => {
    const c = await signedUp('수집가닉');
    const image = 'https://media.rawg.io/media/games/a.jpg';
    await c.request('PUT', '/api/me/library-games/3498', { id: 3498, name: 'GTA V', image });
    await c.request('PUT', '/api/me/library-order', { order: [1_000_003_498, 10] });
    await c.request('PUT', '/api/me/profile-visibility', { public: true });

    const { games } = (await showcase(t.client(), '수집가닉')).json;
    assert.equal(games[0].appId, 1_000_003_498);
    assert.deepEqual([games[0].name, games[0].custom, games[0].image], ['GTA V', true, image]);
    assert.equal(games[1].name, 'Short');
  });

  it('진열장이 비어 있으면 Steam을 부르지 않고 빈 목록을 준다', async () => {
    const c = await signedUp('빈진열장');
    await c.request('PUT', '/api/me/profile-visibility', { public: true });
    const before = fake.callsTo('api.steampowered.com').length;
    assert.deepEqual((await showcase(t.client(), '빈진열장')).json, { nickname: '빈진열장', games: [] });
    assert.equal(fake.callsTo('api.steampowered.com').length, before);
  });

  it('닉네임은 대소문자를 구분하지 않고, 없는 닉네임·너무 긴 닉네임은 404', async () => {
    const c = await signedUp('MixedCase');
    await c.request('PUT', '/api/me/profile-visibility', { public: true });
    assert.equal((await showcase(t.client(), 'mixedcase')).status, 200);
    assert.equal((await showcase(t.client(), '없는사람')).status, 404);
    assert.equal((await showcase(t.client(), 'x'.repeat(50))).status, 404);
  });
});

describe('닉네임이 겹칠 때', () => {
  it('이미 공개 중인 닉네임이면 공개할 수 없다 (409). 비공개끼리는 겹쳐도 된다', async () => {
    const a = await signedUp('쌍둥이');
    const b = await signedUp('쌍둥이');
    assert.equal((await a.request('PUT', '/api/me/profile-visibility', { public: true })).status, 200);
    assert.equal((await b.request('PUT', '/api/me/profile-visibility', { public: true })).status, 409);
    // 이미 공개한 상태에서 다시 공개 요청을 보내도 문제없다
    assert.equal((await a.request('PUT', '/api/me/profile-visibility', { public: true })).status, 200);
  });

  it('공개 중에 다른 공개 계정과 같은 닉네임으로 바꾸면 409, 비공개일 때는 바꿀 수 있다', async () => {
    const a = await signedUp('원조닉');
    const b = await signedUp('다른닉');
    await a.request('PUT', '/api/me/profile-visibility', { public: true });
    // 비공개인 b는 같은 닉네임으로 바꿀 수 있다
    assert.equal((await b.request('PATCH', '/api/me', { nickname: '원조닉' })).status, 200);
    // 하지만 공개하려면 막힌다
    assert.equal((await b.request('PUT', '/api/me/profile-visibility', { public: true })).status, 409);
    await b.request('PATCH', '/api/me', { nickname: '새닉네임' });
    assert.equal((await b.request('PUT', '/api/me/profile-visibility', { public: true })).status, 200);
    // 공개 중인 b가 a의 닉네임으로 바꾸려 하면 막힌다
    assert.equal((await b.request('PATCH', '/api/me', { nickname: '원조닉' })).status, 409);
    assert.equal((await b.request('GET', '/api/auth/me')).json.user.nickname, '새닉네임');
  });
});
