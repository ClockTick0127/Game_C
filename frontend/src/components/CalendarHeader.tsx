import { useEffect, useRef, useState } from 'react';

interface Props {
  year: number;
  month: number;
  totalCount: number;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onJump: (year: number, month: number) => void;
}

const MIN_YEAR = 1970;
const MAX_YEAR = 2100;

export function CalendarHeader({ year, month, totalCount, loading, onPrev, onNext, onToday, onJump }: Props) {
  const [open, setOpen] = useState(false);
  const [yearDraft, setYearDraft] = useState(String(year));
  const [monthDraft, setMonthDraft] = useState(month);
  const pickerRef = useRef<HTMLDivElement>(null);
  const yearInputRef = useRef<HTMLInputElement>(null);

  // 열 때마다 현재 보고 있는 달로 초기화
  const openPicker = () => {
    setYearDraft(String(year));
    setMonthDraft(month);
    setOpen(true);
  };

  // 선택기를 열면 연도 입력창으로 포커스를 옮긴다
  useEffect(() => {
    if (open) yearInputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const parsedYear = /^\d{4}$/.test(yearDraft) ? Number(yearDraft) : NaN;
  const validYear = parsedYear >= MIN_YEAR && parsedYear <= MAX_YEAR;

  const stepYear = (delta: number) => {
    const base = validYear ? parsedYear : year;
    setYearDraft(String(Math.min(MAX_YEAR, Math.max(MIN_YEAR, base + delta))));
  };

  const apply = (m: number) => {
    if (!validYear) return;
    onJump(parsedYear, m);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      // 선택기가 Esc를 처리했다는 표시 — 뒤의 게임 패널이 같은 키로 함께 닫히지 않게 한다
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      apply(monthDraft);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      stepYear(e.key === 'ArrowUp' ? 1 : -1);
    }
  };

  return (
    <header className="cal-header">
      <div className="cal-title">
        {/* 선택기 안의 입력창·버튼에서 올라오는 키 입력(Esc, Enter, 방향키)을 한곳에서 받는 컨테이너 */}
        <div className="cal-picker" ref={pickerRef} role="presentation" onKeyDown={onKeyDown}>
          <button
            type="button"
            className="cal-picker-trigger"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => (open ? setOpen(false) : openPicker())}
          >
            {year}년 {month + 1}월
          </button>

          {open && (
            <div className="cal-popover" role="dialog" aria-label="연도와 월 선택">
              <div className="cal-popover-year">
                <button type="button" onClick={() => stepYear(-1)} aria-label="이전 해">
                  ‹
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  ref={yearInputRef}
                  value={yearDraft}
                  aria-label="연도 입력"
                  aria-invalid={!validYear}
                  className={validYear ? undefined : 'invalid'}
                  onChange={(e) => setYearDraft(e.target.value.replace(/\D/g, ''))}
                  onFocus={(e) => e.target.select()}
                />
                <span>년</span>
                <button type="button" onClick={() => stepYear(1)} aria-label="다음 해">
                  ›
                </button>
              </div>

              <div className="cal-popover-months">
                {Array.from({ length: 12 }, (_, m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={!validYear}
                    className={m === monthDraft ? 'active' : undefined}
                    onClick={() => apply(m)}
                  >
                    {m + 1}월
                  </button>
                ))}
              </div>

              <p className="cal-popover-hint">
                {validYear
                  ? '연도를 입력하고 Enter, 또는 월을 눌러 이동'
                  : `${MIN_YEAR}~${MAX_YEAR}년 사이로 입력하세요`}
              </p>
            </div>
          )}
        </div>
        <span className="cal-count">{loading ? '불러오는 중…' : `출시 예정·출시작 ${totalCount}개`}</span>
      </div>
      <nav className="cal-nav">
        <button type="button" onClick={onPrev} aria-label="이전 달">
          ‹
        </button>
        <button type="button" onClick={onToday}>
          오늘
        </button>
        <button type="button" onClick={onNext} aria-label="다음 달">
          ›
        </button>
      </nav>
    </header>
  );
}
