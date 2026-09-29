import { useCallback, useMemo, useState } from 'react';
import { CalendarFilters } from '../components/CalendarFilters';
import { CalendarGrid } from '../components/CalendarGrid';
import { CalendarHeader } from '../components/CalendarHeader';
import { SidePanel } from '../components/SidePanel';
import { useAuth } from '../contexts/AuthContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useMonthlyReleases } from '../hooks/useMonthlyReleases';
import type { Game } from '../types';
import { collectOptions, filterGames, groupByDate, NO_FILTER, type GameFilter } from '../utils/filterGames';

function currentMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

export function CalendarPage() {
  useDocumentTitle();
  const [{ year, month }, setCursor] = useState(currentMonth);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const { user } = useAuth();
  const { isFavorite } = useFavorites();
  // 필터는 달을 넘겨도 유지한다 ("RPG만 보면서 다음 달로")
  const [filter, setFilter] = useState<GameFilter>(NO_FILTER);
  const { games: allGames, totalCount, isSample, partial, loading, error, reload } = useMonthlyReleases(year, month);

  const games = useMemo(() => filterGames(allGames, filter, isFavorite), [allGames, filter, isFavorite]);
  const gamesByDate = useMemo(() => groupByDate(games), [games]);
  const platforms = useMemo(
    () =>
      collectOptions(
        allGames.map((g) => g.platforms),
        filter.platform,
      ),
    [allGames, filter.platform],
  );
  const genres = useMemo(
    () =>
      collectOptions(
        allGames.map((g) => g.genres),
        filter.genre,
      ),
    [allGames, filter.genre],
  );

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
      <h1 className="sr-only">게임 출시 캘린더</h1>
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

        <CalendarFilters
          filter={filter}
          onChange={setFilter}
          platforms={platforms}
          genres={genres}
          canFilterFavorites={user !== null}
          shownCount={games.length}
          totalCount={totalCount}
        />

        {partial && (
          <div className="banner">
            일부 출시 정보를 불러오지 못해 목록이 완전하지 않을 수 있습니다.
            <button type="button" onClick={reload}>
              다시 시도
            </button>
          </div>
        )}

        {error && (
          <div className="banner error">
            출시 정보를 불러오지 못했습니다: {error}
            <button type="button" onClick={reload}>
              다시 시도
            </button>
          </div>
        )}

        {!loading && totalCount > 0 && games.length === 0 && (
          <p className="muted filter-empty" role="status">
            조건에 맞는 게임이 이 달에는 없습니다. 검색어나 필터를 바꿔 보세요.
          </p>
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
