import { describe, expect, it } from 'vitest';
import { loginPath, safeRedirect, withRedirect } from './redirect';

describe('safeRedirect', () => {
  it('내부 경로는 그대로 돌려준다', () => {
    expect(safeRedirect('/mypage')).toBe('/mypage');
    expect(safeRedirect('/goty?year=2024')).toBe('/goty?year=2024');
  });

  it.each([
    null,
    '',
    'mypage',
    'https://evil.example.com',
    '//evil.example.com',
    '/\\evil.example.com',
    'javascript:alert(1)',
  ])('외부 주소나 잘못된 값(%s)은 홈으로 보낸다', (value) => {
    expect(safeRedirect(value)).toBe('/');
  });
});

describe('withRedirect / loginPath', () => {
  it('돌아갈 곳이 홈이면 쿼리를 붙이지 않는다', () => {
    expect(withRedirect('/login', '/')).toBe('/login');
    expect(loginPath('/')).toBe('/login');
  });

  it('돌아갈 경로를 인코딩해서 붙인다', () => {
    expect(loginPath('/mypage?tab=1')).toBe('/login?redirect=%2Fmypage%3Ftab%3D1');
  });
});
