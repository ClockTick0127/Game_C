import assert from 'node:assert/strict';
import { after, before, it, mock } from 'node:test';
import { startTestServer } from './helpers.ts';

// LOG_REQUESTS는 서버가 시작될 때 한 번 읽으므로, 끈 상태는 별도 파일에서 검증한다.
let t: Awaited<ReturnType<typeof startTestServer>>;

before(async () => {
  t = await startTestServer({ logRequests: false });
});
after(() => t.close());

it('LOG_REQUESTS=0이면 요청 로그를 남기지 않지만 요청 ID는 계속 붙는다', async () => {
  const log = mock.method(console, 'log', () => {});
  const res = await fetch(`${t.base}/api/nope`);
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(res.status, 404);
  assert.ok(res.headers.get('x-request-id'));
  assert.equal(log.mock.callCount(), 0);
  mock.restoreAll();
});
