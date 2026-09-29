import { useTheme } from '../hooks/useTheme';
import type { Theme } from '../utils/theme';

const LABELS: Record<Theme, { icon: string; text: string }> = {
  system: { icon: '🖥️', text: '시스템 설정' },
  light: { icon: '☀️', text: '라이트' },
  dark: { icon: '🌙', text: '다크' },
};

/** 누를 때마다 시스템 설정 → 라이트 → 다크 순으로 바뀐다 */
export function ThemeToggle() {
  const { theme, cycle } = useTheme();
  const { icon, text } = LABELS[theme];

  return (
    <button type="button" className="nav-link theme-toggle" onClick={cycle} title={`테마: ${text} (눌러서 변경)`}>
      <span aria-hidden="true">{icon}</span>
      <span className="sr-only">테마: {text}. 눌러서 변경</span>
    </button>
  );
}
