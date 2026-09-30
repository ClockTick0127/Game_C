export type CalendarView = 'month' | 'week' | 'list';

export const VIEW_LABELS: Record<CalendarView, string> = { month: '월간', week: '주간', list: '목록' };

const STORAGE_KEY = 'calendarView';

/** 저장된 선택. 없으면 좁은 화면(모바일)은 주간, 그 외는 월간 */
export function readStoredView(): CalendarView {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'month' || value === 'week' || value === 'list') return value;
  } catch {
    // 저장소를 못 쓰는 환경이면 기본값
  }
  return window.matchMedia?.('(max-width: 640px)').matches ? 'week' : 'month';
}

export function storeView(view: CalendarView): void {
  try {
    localStorage.setItem(STORAGE_KEY, view);
  } catch {
    // 저장하지 못해도 이번 방문에는 적용된다
  }
}
