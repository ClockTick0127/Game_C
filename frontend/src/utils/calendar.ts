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

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatKoreanDate(key: string): string {
  const date = parseDateKey(key);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAYS[date.getDay()]})`;
}

/** 오늘부터 key 날짜까지 남은 일수 (오늘이면 0, 지났으면 음수) */
export function daysUntil(key: string): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((parseDateKey(key).getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

/** date가 속한 주(일요일 시작)의 7일. 월간 그리드와 같은 기준이다. */
export function buildWeekDays(date: Date): CalendarDay[] {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { date: day, key: toDateKey(day), inMonth: true };
  });
}

/** "9월 13일 – 19일", 달이 걸치면 "8월 30일 – 9월 5일" */
export function formatWeekRange(days: CalendarDay[]): string {
  const first = days[0]!.date;
  const last = days[days.length - 1]!.date;
  const end =
    first.getMonth() === last.getMonth() ? `${last.getDate()}일` : `${last.getMonth() + 1}월 ${last.getDate()}일`;
  return `${first.getMonth() + 1}월 ${first.getDate()}일 – ${end}`;
}
