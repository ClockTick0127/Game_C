import { useState } from 'react';
import { CalendarGrid } from './components/CalendarGrid';
import { CalendarHeader } from './components/CalendarHeader';
import { DayGamesModal } from './components/DayGamesModal';
import { GameDetailModal } from './components/GameDetailModal';
import { useMonthlyReleases } from './hooks/useMonthlyReleases';
import type { Game } from './types';

function currentMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

export default function App() {
  const [{ year, month }, setCursor] = useState(currentMonth);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const { gamesByDate, totalCount, isSample, loading, error, reload } = useMonthlyReleases(year, month);

  const moveMonth = (delta: number) => {
    // Date가 월 넘김(12월 → 다음 해 1월)을 알아서 처리한다
    const d = new Date(year, month + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  };

  return (
    <div className="app">
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
        onToday={() => setCursor(currentMonth())}
      />

      {error && (
        <div className="banner error">
          출시 정보를 불러오지 못했습니다: {error}
          <button type="button" onClick={reload}>
            다시 시도
          </button>
        </div>
      )}

      <main className={loading ? 'is-loading' : undefined}>
        <CalendarGrid
          year={year}
          month={month}
          gamesByDate={gamesByDate}
          onSelectGame={setSelectedGame}
          onSelectDay={setSelectedDay}
        />
      </main>

      <footer className="footer">
        게임 데이터 제공:{' '}
        <a href="https://rawg.io" target="_blank" rel="noreferrer">
          RAWG
        </a>
      </footer>

      {/* 상세 모달을 닫으면 열려 있던 날짜 목록으로 돌아간다 */}
      {selectedGame ? (
        <GameDetailModal game={selectedGame} onClose={() => setSelectedGame(null)} />
      ) : selectedDay ? (
        <DayGamesModal
          dateKey={selectedDay}
          games={gamesByDate.get(selectedDay) ?? []}
          onSelectGame={setSelectedGame}
          onClose={() => setSelectedDay(null)}
        />
      ) : null}
    </div>
  );
}
