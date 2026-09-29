import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, errorMessage, request, UNAUTHORIZED_EVENT } from './client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** fetch를 가짜로 바꾼다. 호출 기록은 반환된 mock에서 볼 수 있다. */
function mockFetch(impl: typeof fetch) {
  const fn = vi.fn<typeof fetch>(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** 취소 신호가 오면 그 이유로 실패하는, 끝나지 않는 요청 */
const hangUntilAborted: typeof fetch = (_url, init) =>
  new Promise((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason));
  });

afterEach(() => vi.useRealTimers());

describe('request — 정상 응답', () => {
  it('JSON 본문을 돌려준다', async () => {
    mockFetch(async () => jsonResponse({ ok: true }));
    await expect(request('/api/health')).resolves.toEqual({ ok: true });
  });

  it('204는 undefined', async () => {
    mockFetch(async () => new Response(null, { status: 204 }));
    await expect(request('/api/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('본문이 있으면 JSON으로 보내고, 없으면 Content-Type을 붙이지 않는다', async () => {
    const fn = mockFetch(async () => jsonResponse({}));
    await request('/api/auth/login', { method: 'POST', body: { a: 1 } });
    expect(fn.mock.calls[0]![1]).toMatchObject({
      method: 'POST',
      body: '{"a":1}',
      headers: { 'Content-Type': 'application/json' },
    });

    await request('/api/health');
    expect(fn.mock.calls[1]![1]?.headers).toBeUndefined();
  });
});

describe('request — 서버 오류 응답', () => {
  it('서버가 보낸 error 메시지와 상태 코드를 ApiError에 담는다', async () => {
    mockFetch(async () => jsonResponse({ error: '이미 가입된 이메일입니다.' }, 409));
    const err = await request('/api/auth/signup', { method: 'POST' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, message: '이미 가입된 이메일입니다.' });
  });

  it('JSON이 아닌 응답(프록시 오류 등)은 상태 코드를 담은 안내 메시지를 쓴다', async () => {
    mockFetch(async () => new Response('<html>Bad Gateway</html>', { status: 502 }));
    const err = await request('/api/games').catch((e: unknown) => e);
    expect((err as ApiError).message).toContain('HTTP 502');
  });

  it('인증이 필요한 API의 401은 로그아웃 이벤트를 발생시킨다', async () => {
    mockFetch(async () => jsonResponse({ error: '로그인이 필요합니다.' }, 401));
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    await request('/api/me/favorites').catch(() => {});
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('/api/auth/* 의 401(비밀번호 틀림 등)은 이벤트를 발생시키지 않는다', async () => {
    mockFetch(async () => jsonResponse({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401));
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    await request('/api/auth/login', { method: 'POST' }).catch(() => {});
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('request — 네트워크 문제', () => {
  it('연결 실패는 영어 원문 대신 한국어 안내로 바꾼다', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    const err = await request('/api/games').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(errorMessage(err)).toBe('서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.');
  });

  it('호출한 쪽이 직접 취소하면 원래의 AbortError를 그대로 던진다', async () => {
    mockFetch(hangUntilAborted);
    const controller = new AbortController();
    const pending = request('/api/games', { signal: controller.signal }).catch((e: unknown) => e);
    controller.abort();
    const err = await pending;
    expect(err).not.toBeInstanceOf(ApiError);
    expect((err as Error).name).toBe('AbortError');
  });

  it('제한 시간을 넘기면 시간 초과 안내를 던진다', async () => {
    // 실제로 15초를 기다리지 않도록 타임아웃 신호를 직접 제어한다
    const timeoutController = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutController.signal);
    mockFetch(hangUntilAborted);
    const pending = request('/api/games').catch((e: unknown) => e);
    timeoutController.abort(new DOMException('timeout', 'TimeoutError'));
    const err = await pending;
    expect(err).toBeInstanceOf(ApiError);
    expect(errorMessage(err)).toContain('너무 늦습니다');
  });
});

describe('errorMessage', () => {
  it('Error가 아니면 기본 메시지', () => {
    expect(errorMessage('문자열')).toBe('알 수 없는 오류가 발생했습니다.');
    expect(errorMessage(new Error('실패'))).toBe('실패');
  });
});
