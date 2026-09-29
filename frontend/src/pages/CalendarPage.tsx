import { useCallback, useState } from 'react';
import { CalendarGrid } from '../components/CalendarGrid';
import { CalendarHeader } from '../components/CalendarHeader';
import { SidePanel } from '../components/SidePanel';
import { useMonthlyReleases } from '../hooks/useMonthlyReleases';
import type { Game } from '../types';

function currentMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

export function CalendarPage() {
  const [{ year, month }, setCursor] = useState(currentMonth);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const { games, gamesByDate, totalCount, isSample, loading, error, reload } = useMonthlyReleases(year, month);

  const changeMonth = (next: { year: number; month: number }) => {
    setCursor(next);
    // 날짜 목록은 그 달에만 의미가 있으므로 닫는다. 보고 있던 게임 정보는 그대로 둔다.
    setSelectedDay(null);
  };

  const moveMonth = (delta: number) => {
    // Date가 월 넘김(12월 → 다음 해 1월)을 알아서 처리한다
    const d = new Date(year, month + delta, 1);
    changeMonth({ year: d.getFullYear(), month: d.getMonth() });
  };

  /** 캘린더에서 게임을 바로 누른 경우 — 날짜 목록을 거치지 않았으므로 "목록으로" 버튼이 없다 */
  const selectGameFromCalendar = (game: Game) => {
    setSelectedDay(null);
    setSelectedGame(game);
  };

  const selectDay = (dateKey: string) => {
    setSelectedGame(null);
    setSelectedDay(dateKey);
  };

  const closePanel = useCallback(() => {
    setSelectedGame(null);
    setSelectedDay(null);
  }, []);

  return (
    <div className="calendar-layout">
      <section className="calendar-main">
        {isSample && (
          <div className="banner">
            샘플 데이터로 표시 중입니다. <code>backend/.env</code>에 <code>RAWG_API_KEY</code>를 설정하고 서버를 다시
            시작하면 실제 출시 정보를 불러옵니다.
          </div>
        )}

        <CalendarHeader
          year={year}
          month={month}
          totalCount={totalCount}
          loading={loading}
          onPrev={() => moveMonth(-1)}
          onNext={() => moveMonth(1)}
          onToday={() => changeMonth(currentMonth())}
          onJump={(y, m) => changeMonth({ year: y, month: m })}
        />

        {error && (
          <div className="banner error">
            출시 정보를 불러오지 못했습니다: {error}
            <button type="button" onClick={reload}>
              다시 시도
            </button>
          </div>
        )}

        <div className={loading ? 'cal-body is-loading' : 'cal-body'}>
          <CalendarGrid
            year={year}
            month={month}
            gamesByDate={gamesByDate}
            selectedGameId={selectedGame?.id ?? null}
            selectedDay={selectedDay}
            onSelectGame={selectGameFromCalendar}
            onSelectDay={selectDay}
          />
        </div>
      </section>

      <SidePanel
        game={selectedGame}
        dayKey={selectedDay}
        dayGames={selectedDay ? (gamesByDate.get(selectedDay) ?? []) : []}
        month={month}
        popularGames={games}
        onSelectGame={setSelectedGame}
        onBack={() => setSelectedGame(null)}
        onClose={closePanel}
      />
    </div>
  );
}
