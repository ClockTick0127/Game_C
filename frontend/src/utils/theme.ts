/** 'system'은 브라우저·OS의 다크 모드 설정을 따른다 */
export type Theme = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'theme';
const THEMES: Theme[] = ['system', 'light', 'dark'];

export function nextTheme(theme: Theme): Theme {
  return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!;
}

/** 저장된 선택. 저장소를 못 쓰는 환경(시크릿 모드 등)이나 잘못된 값이면 'system' */
export function readStoredTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(value as Theme) ? (value as Theme) : 'system';
  } catch {
    return 'system';
  }
}

export function storeTheme(theme: Theme): void {
  try {
    if (theme === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 저장하지 못해도 이번 방문에는 적용된다
  }
}

/**
 * <html data-theme>을 바꾸고, 모바일 브라우저 주소창 색(theme-color)을 배경색에 맞춘다.
 * 'system'이면 속성을 지워 CSS의 시스템 설정 규칙을 따른다.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);

  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}
