interface Props {
  year: number;
  month: number;
  totalCount: number;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function CalendarHeader({ year, month, totalCount, loading, onPrev, onNext, onToday }: Props) {
  return (
    <header className="cal-header">
      <div className="cal-title">
        <h1>
          {year}년 {month + 1}월
        </h1>
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
