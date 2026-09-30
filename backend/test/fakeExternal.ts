/**
 * RAWG·Steam 같은 외부 API 호출을 가짜로 바꾼다.
 * 테스트 서버로 가는 요청(테스트 클라이언트의 fetch)은 그대로 통과시키고, 그 밖의 주소만 handler가 응답한다.
 * handler가 undefined를 돌려주면 "예상하지 못한 외부 요청"으로 보고 테스트를 실패시킨다.
 */
export type ExternalHandler = (url: URL, init?: RequestInit) => Response | Promise<Response> | undefined;

export function installFakeFetch(serverBase: string, handler: ExternalHandler) {
  const realFetch = globalThis.fetch;
  const serverOrigin = new URL(serverBase).origin;
  const calls: URL[] = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.origin === serverOrigin) return realFetch(input, init);

    calls.push(url);
    const response = await handler(url, init);
    if (!response) throw new Error(`예상하지 못한 외부 요청: ${url.href}`);
    return response;
  }) as typeof fetch;

  return {
    /** 지금까지 나간 외부 요청 */
    calls,
    /** 특정 주소로 나간 외부 요청만 */
    callsTo: (host: string, path = '') => calls.filter((u) => u.host === host && u.pathname.startsWith(path)),
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** RAWG 목록 응답의 게임 한 건 */
export function rawgGame(overrides: Record<string, unknown> & { id: number; name: string }) {
  return {
    slug: String(overrides.name).toLowerCase().replace(/\W+/g, '-'),
    released: '2030-01-15',
    background_image: `https://media.rawg.io/media/games/aa/game-${overrides.id}.jpg`,
    rating: 4,
    metacritic: null,
    platforms: [{ platform: { id: 4, name: 'PC', slug: 'pc' } }],
    genres: [{ id: 5, name: 'RPG' }],
    tags: [],
    esrb_rating: null,
    ...overrides,
  };
}
