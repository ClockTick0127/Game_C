import { useCallback, useEffect, useState } from 'react';
import { applyTheme, nextTheme, readStoredTheme, storeTheme, type Theme } from '../utils/theme';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    // 시스템 설정을 따르는 중에 OS 테마가 바뀌면 주소창 색도 다시 맞춘다
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    query?.addEventListener('change', onChange);
    return () => query?.removeEventListener('change', onChange);
  }, [theme]);

  const cycle = useCallback(() => {
    const next = nextTheme(theme);
    storeTheme(next);
    setTheme(next);
  }, [theme]);

  return { theme, cycle };
}
