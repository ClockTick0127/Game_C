export interface CalendarDay {
  date: Date;
  /** YYYY-MM-DD (로컬 시간 기준) */
  key: string;
  inMonth: boolean;
}

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** month는 0부터 시작 (JS Date 규칙) */
export function getMonthRange(year: number, month: number): { start: string; end: string } {
  return {
    start: toDateKey(new Date(year, month, 1)),
    end: toDateKey(new Date(year, month + 1, 0)),
  };
}

/** 일요일 시작 기준으로 해당 월을 채우는 주 단위 날짜 배열 (앞뒤 달 날짜 포함) */
export function buildCalendarDays(year: number, month: number): CalendarDay[] {
  const leading = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;

  return Array.from({ length: totalCells }, (_, i) => {
    const date = new Date(year, month, 1 - leading + i);
    return { date, key: toDateKey(date), inMonth: date.getMonth() === month };
  });
}

export function formatKoreanDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${y}년 ${m}월 ${d}일 (${weekday})`;
}
