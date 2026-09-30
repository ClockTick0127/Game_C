import { mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * 임시 DB로 서버를 띄운다. db.ts가 import 시점에 DB_PATH를 읽으므로 환경변수를 먼저 설정하고 동적 import 한다.
 * 테스트 파일마다 별도 프로세스로 실행되므로 DB와 요청 제한 상태가 파일 단위로 분리된다.
 */
export async function startTestServer({
  rateLimit = false,
  rawgKey = '',
  rawgMaxCallsPerMinute = 10_000,
  logRequests = false,
} = {}) {
  process.env.LOG_REQUESTS = logRequests ? '1' : '0';
  process.env.RAWG_MAX_CALLS_PER_MINUTE = String(rawgMaxCallsPerMinute);
  process.env.ITUNES_MAX_CALLS_PER_MINUTE = '10000';
  process.env.RATE_LIMIT_DISABLED = rateLimit ? '0' : '1';
  process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'game-calendar-test-')), 'test.db');
  process.env.RAWG_API_KEY = rawgKey;

  const { app } = await import('../src/app.ts');
  const { db } = await import('../src/db.ts');
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    base,
    db,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          db.close();
          resolve();
        });
        server.closeAllConnections();
      }),
    /** 쿠키를 기억하는 간단한 HTTP 클라이언트 (브라우저 한 대에 해당) */
    client() {
      const self = {
        cookie: '',
        async request(method: string, path: string, body?: unknown) {
          const res = await fetch(base + path, {
            method,
            headers: {
              ...(body !== undefined && { 'content-type': 'application/json' }),
              ...(self.cookie && { cookie: self.cookie }),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
          });
          for (const line of res.headers.getSetCookie()) {
            const pair = line.split(';')[0]!;
            // 값이 비어 있으면(clearCookie) 쿠키를 지운 것
            self.cookie = pair.endsWith('=') ? '' : pair;
          }
          const text = await res.text();
          return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
        },
      };
      return self;
    },
  };
}

export const sampleGame = (id = 1) => ({
  id,
  name: `테스트 게임 ${id}`,
  released: '2030-01-15',
  image: 'https://example.com/a.jpg',
  rating: 4.2,
  metacritic: 88,
  platforms: ['PC'],
  genres: ['RPG'],
  url: 'https://rawg.io/games/test',
});
