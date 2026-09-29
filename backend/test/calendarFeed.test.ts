import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildIcs } from '../src/utils/ics.ts';
import { sampleGame, startTestServer } from './helpers.ts';

let t: Awaited<ReturnType<typeof startTestServer>>;

before(async () => {
  t = await startTestServer();
});
after(() => t.close());

async function signedIn(email: string) {
  const c = t.client();
  await c.request('POST', '/api/auth/signup', { email, password: 'password-1234', nickname: '구독자' });
  return c;
}

const fetchIcs = (token: string) => fetch(`${t.base}/api/calendar/${token}.ics`);

describe('캘린더 구독(ICS)', () => {
  it('토큰은 로그인해야 받을 수 있고, 다시 요청해도 같은 값이다', async () => {
    assert.equal((await t.client().request('GET', '/api/me/calendar-token')).status, 401);

    const c = await signedIn('ics1@example.com');
    const first = (await c.request('GET', '/api/me/calendar-token')).json.token as string;
    const second = (await c.request('GET', '/api/me/calendar-token')).json.token as string;
    assert.ok(first.length >= 32);
    assert.equal(first, second);
  });

  it('로그인 없이 구독 주소로 관심 게임을 .ics로 받는다', async () => {
    const c = await signedIn('ics2@example.com');
    await c.request('PUT', '/api/me/favorites/7', sampleGame(7));
    const { token } = (await c.request('GET', '/api/me/calendar-token')).json;

    const res = await fetchIcs(token);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type')!, /^text\/calendar; charset=utf-8/);
    const body = await res.text();
    assert.match(body, /^BEGIN:VCALENDAR\r\n/);
    assert.match(body, /UID:game-7@game-calendar/);
    assert.match(body, /DTSTART;VALUE=DATE:20300115/);
    assert.match(body, /DTEND;VALUE=DATE:20300116/);
    assert.match(body, /SUMMARY:테스트 게임 7/);
  });

  it('없는 토큰이나 .ics가 아닌 요청은 404', async () => {
    assert.equal((await fetchIcs('nope')).status, 404);
    const c = await signedIn('ics3@example.com');
    const { token } = (await c.request('GET', '/api/me/calendar-token')).json;
    assert.equal((await fetch(`${t.base}/api/calendar/${token}`)).status, 404);
  });

  it('토큰을 재발급하면 옛 주소는 막힌다', async () => {
    const c = await signedIn('ics4@example.com');
    const old = (await c.request('GET', '/api/me/calendar-token')).json.token as string;
    const fresh = (await c.request('POST', '/api/me/calendar-token')).json.token as string;
    assert.notEqual(old, fresh);
    assert.equal((await fetchIcs(old)).status, 404);
    assert.equal((await fetchIcs(fresh)).status, 200);
  });

  it('다른 사람의 관심 게임은 섞이지 않는다', async () => {
    const a = await signedIn('ics5@example.com');
    const b = await signedIn('ics6@example.com');
    await a.request('PUT', '/api/me/favorites/11', sampleGame(11));
    const { token } = (await b.request('GET', '/api/me/calendar-token')).json;
    assert.doesNotMatch(await (await fetchIcs(token)).text(), /game-11@/);
  });
});

describe('buildIcs', () => {
  const now = new Date('2030-01-01T00:00:00Z');

  it('특수문자를 이스케이프하고 75옥텟마다 줄을 접는다', () => {
    const name = '가'.repeat(40) + ', a;b\\c';
    const ics = buildIcs('내 캘린더', [{ ...sampleGame(1), name }], now);
    for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
    const unfolded = ics.replaceAll('\r\n ', '');
    assert.ok(unfolded.includes('SUMMARY:' + '가'.repeat(40) + '\\, a\\;b\\\\c'));
  });

  it('월말 출시일의 종료일은 다음 달 1일이다', () => {
    const ics = buildIcs('x', [{ ...sampleGame(1), released: '2030-12-31' }], now);
    assert.match(ics, /DTEND;VALUE=DATE:20310101/);
  });

  it('관심 게임이 없어도 유효한 빈 캘린더가 된다', () => {
    const ics = buildIcs('x', [], now);
    assert.ok(ics.startsWith('BEGIN:VCALENDAR') && ics.trimEnd().endsWith('END:VCALENDAR'));
    assert.ok(!ics.includes('BEGIN:VEVENT'));
  });
});
