import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCalendarDays,
  buildWeekDays,
  daysUntil,
  formatKoreanDate,
  formatWeekRange,
  getMonthRange,
  toDateKey,
} from './calendar';

afterEach(() => vi.useRealTimers());

describe('toDateKey / getMonthRange', () => {
  it('날짜를 YYYY-MM-DD로 만든다', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('월의 첫날과 마지막 날을 구한다 (month는 0부터)', () => {
    expect(getMonthRange(2026, 8)).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(getMonthRange(2026, 11)).toEqual({ start: '2026-12-01', end: '2026-12-31' });
  });

  it('윤년의 2월을 처리한다', () => {
    expect(getMonthRange(2024, 1).end).toBe('2024-02-29');
    expect(getMonthRange(2025, 1).end).toBe('2025-02-28');
  });
});

describe('buildCalendarDays', () => {
  it('일요일 시작으로 주 단위(7의 배수)를 채우고 앞뒤 달 날짜를 표시한다', () => {
    // 2026년 9월 1일은 화요일 → 앞에 일·월 2칸, 30일 뒤로 토요일까지
    const days = buildCalendarDays(2026, 8);
    expect(days.length % 7).toBe(0);
    expect(days[0]).toMatchObject({ key: '2026-08-30', inMonth: false });
    expect(days[2]).toMatchObject({ key: '2026-09-01', inMonth: true });
    expect(days.filter((d) => d.inMonth)).toHaveLength(30);
    expect(days.at(-1)?.date.getDay()).toBe(6);
  });

  it('1일이 일요일이고 28일이면 정확히 4주다', () => {
    // 2026년 2월 1일은 일요일
    const days = buildCalendarDays(2026, 1);
    expect(days).toHaveLength(28);
    expect(days[0]).toMatchObject({ key: '2026-02-01', inMonth: true });
  });

  it('연말·연초 경계의 날짜를 올바른 해로 만든다', () => {
    // 2026년 12월 31일은 목요일 → 뒤에 2027-01-01(금), 01-02(토)가 붙는다
    const days = buildCalendarDays(2026, 11);
    expect(days.at(-2)).toMatchObject({ key: '2027-01-01', inMonth: false });
    expect(days.at(-1)).toMatchObject({ key: '2027-01-02', inMonth: false });
  });
});

describe('formatKoreanDate', () => {
  it('요일까지 한국어로 표시한다', () => {
    expect(formatKoreanDate('2026-09-29')).toBe('2026년 9월 29일 (화)');
  });
});

describe('daysUntil', () => {
  it('오늘은 0, 내일은 1, 어제는 -1 (시각과 무관)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 23, 59));
    expect(daysUntil('2026-09-29')).toBe(0);
    expect(daysUntil('2026-09-30')).toBe(1);
    expect(daysUntil('2026-09-28')).toBe(-1);
  });

  it('달을 넘어가도 일수를 정확히 센다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 9, 0));
    expect(daysUntil('2026-10-05')).toBe(6);
  });
});

describe('주간 계산', () => {
  it('일요일부터 토요일까지 7일을 만든다 (2026-09-16은 수요일)', () => {
    const days = buildWeekDays(new Date(2026, 8, 16));
    expect(days.map((d) => d.key)).toEqual([
      '2026-09-13',
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
    ]);
    expect(days[0]!.date.getDay()).toBe(0);
  });

  it('일요일은 그 주의 첫날이고, 토요일은 그 주의 마지막날이다', () => {
    expect(buildWeekDays(new Date(2026, 8, 13))[0]!.key).toBe('2026-09-13');
    expect(buildWeekDays(new Date(2026, 8, 19))[0]!.key).toBe('2026-09-13');
  });

  it('달과 해가 바뀌는 주도 이어서 만든다', () => {
    const days = buildWeekDays(new Date(2026, 11, 31)); // 목요일
    expect(days[0]!.key).toBe('2026-12-27');
    expect(days[6]!.key).toBe('2027-01-02');
  });

  it('기간 문구: 같은 달이면 뒤의 월을 생략한다', () => {
    expect(formatWeekRange(buildWeekDays(new Date(2026, 8, 16)))).toBe('9월 13일 – 19일');
    expect(formatWeekRange(buildWeekDays(new Date(2026, 11, 31)))).toBe('12월 27일 – 1월 2일');
  });
});
