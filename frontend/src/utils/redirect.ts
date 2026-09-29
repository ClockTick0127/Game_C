/**
 * 로그인 후 돌아갈 경로. 외부 사이트로 보내는 오픈 리다이렉트를 막기 위해
 * "/"로 시작하는 내부 경로만 허용한다 ("//evil.com", "/\evil.com"은 외부 주소로 해석되므로 거부).
 */
export function safeRedirect(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  return value;
}

/** path에 ?redirect=를 붙인다. 돌아갈 곳이 홈이면 생략. */
export function withRedirect(path: string, redirect: string): string {
  return redirect === '/' ? path : `${path}?${new URLSearchParams({ redirect })}`;
}

/** 로그인 페이지 경로. 로그인 후 from으로 돌아온다. */
export function loginPath(from: string): string {
  return withRedirect('/login', from);
}
