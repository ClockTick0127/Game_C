import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarFilters } from '../components/CalendarFilters';
import { CalendarGrid } from '../components/CalendarGrid';
import { CalendarHeader } from '../components/CalendarHeader';
import { ListView } from '../components/ListView';
import { SidePanel } from '../components/SidePanel';
import { WeekView } from '../components/WeekView';
import { useAuth } from '../contexts/AuthContext';
import { useFavorites } from '../contexts/FavoritesContext';
import { useTaste } from '../contexts/TasteContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useMonthlyReleases } from '../hooks/useMonthlyReleases';
import type { Game } from '../types';
import { buildWeekDays, formatWeekRange } from '../utils/calendar';
import { readStoredView, storeView, type CalendarView } from '../utils/calendarView';
import { collectOptions, filterGames, groupByDate, NO_FILTER, type GameFilter } from '../utils/filterGames';
import { withPreferences } from '../utils/preferences';

/** 그 달의 대표 날짜: 이번 달이면 오늘, 아니면 1일 (보기를 바꿔도 보던 위치가 자연스럽게 이어진다) */
function anchorForMonth(year: number, month: number): Date {
  const now = new Date();
  return now.getFullYear() === year && now.getMonth() === month ? now : new Date(year, month, 1);
}

export function CalendarPage() {
  useDocumentTitle();
  const [view, setView] = useState<CalendarView>(readStoredView);
  // 보고 있는 기준 날짜. 월간·목록은 이 날짜가 속한 달, 주간은 속한 주를 보여준다.
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const { user } = useAuth();
  const { isFavorite } = useFavorites();
  const taste = useTaste();
  // 필터는 달을 넘겨도 유지한다 ("RPG만 보면서 다음 달로")
  // 처음에는 마이페이지에서 정해 둔 선호 플랫폼·장르가 기본 필터다
  const [filter, setFilter] = useState<GameFilter>(() => withPreferences(NO_FILTER, user));
  // 로그인 정보가 화면보다 늦게 도착하는 경우에도 한 번만 적용한다 (이후에 사용자가 바꾼 필터는 건드리지 않는다)
  const preferencesApplied = useRef(user !== null);
  useEffect(() => {
    if (user && !preferencesApplied.current) {
      preferencesApplied.current = true;
      setFilter((current) => withPreferences(current, user));
    }
  }, [user]);

  const isWeek = view === 'week';
  const weekDays = useMemo(() => buildWeekDays(anchor), [anchor]);
  const firstDay = isWeek ? weekDays[0]!.date : anchor;
  const lastDay = isWeek ? weekDays[6]!.date : anchor;
  const year = firstDay.getFullYear();
  const month = firstDay.getMonth();
  // 주가 두 달에 걸쳐 있을 때만 다음 달 데이터도 불러온다
  const spansTwoMonths = isWeek && (lastDay.getMonth() !== month || lastDay.getFullYear() !== year);

  const first = useMonthlyReleases(year, month);
  const second = useMonthlyReleases(lastDay.getFullYear(), lastDay.getMonth(), spansTwoMonths);

  const allGames = useMemo(() => {
    if (!isWeek) return first.games;
    const start = weekDays[0]!.key;
    const end = weekDays[6]!.key;
    return [...first.games, ...second.games].filter((g) => g.released >= start && g.released <= end);
  }, [isWeek, first.games, second.games, weekDays]);

  const games = useMemo(
    () =>
      filterGames(
        allGames,
        // 취향을 아직 알 수 없으면(다른 계정으로 바뀐 직후 등) 켜져 있던 "내 취향만"이 모든 게임을 숨기지 않게 한다
        taste.ready ? filter : { ...filter, tasteOnly: false },
        isFavorite,
        (game) => taste.match(game) !== null,
      ),
    [allGames, filter, isFavorite, taste],
  );
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

  const totalCount = allGames.length;
  const loading = first.loading || second.loading;
  const error = first.error ?? second.error;
  const partial = first.partial || second.partial;
  const isSample = first.isSample || second.isSample;
  const reload = () => {
    first.reload();
    if (spansTwoMonths) second.reload();
  };
  const scope = isWeek ? '이 주' : '이 달';

  const moveTo = (next: Date) => {
    setAnchor(next);
    // 날짜 목록은 그 기간에만 의미가 있으므로 닫는다. 보고 있던 게임 정보는 그대로 둔다.
    setSelectedDay(null);
  };

  const goToMonth = (y: number, m: number) => moveTo(anchorForMonth(y, m));

  const move = (delta: number) => {
    if (isWeek) moveTo(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + delta * 7));
    // Date가 월 넘김(12월 → 다음 해 1월)을 알아서 처리한다
    else goToMonth(...monthAfter(anchor, delta));
  };

  const changeView = (next: CalendarView) => {
    setView(next);
    storeView(next);
    setSelectedDay(null);
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
          view={view}
          unit={isWeek ? '주' : '달'}
          rangeLabel={isWeek ? formatWeekRange(weekDays) : undefined}
          onViewChange={changeView}
          onPrev={() => move(-1)}
          onNext={() => move(1)}
          onToday={() => moveTo(new Date())}
          onJump={goToMonth}
        />

        <CalendarFilters
          filter={filter}
          onChange={setFilter}
          platforms={platforms}
          genres={genres}
          canFilterFavorites={user !== null}
          canFilterTaste={taste.ready}
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
            조건에 맞는 게임이 {scope}에는 없습니다. 검색어나 필터를 바꿔 보세요.
          </p>
        )}

        <div className={loading ? 'cal-body is-loading' : 'cal-body'}>
          {view === 'month' && (
            <CalendarGrid
              year={year}
              month={month}
              gamesByDate={gamesByDate}
              selectedGameId={selectedGame?.id ?? null}
              selectedDay={selectedDay}
              onSelectGame={selectGameFromCalendar}
              onSelectDay={selectDay}
            />
          )}
          {view === 'week' && (
            <WeekView
              days={weekDays}
              gamesByDate={gamesByDate}
              selectedGameId={selectedGame?.id ?? null}
              selectedDay={selectedDay}
              onSelectGame={selectGameFromCalendar}
              onSelectDay={selectDay}
            />
          )}
          {view === 'list' && (
            <ListView
              gamesByDate={gamesByDate}
              selectedGameId={selectedGame?.id ?? null}
              onSelectGame={selectGameFromCalendar}
              emptyMessage={loading || error || totalCount > 0 ? '' : '이 달에는 표시할 출시 정보가 없습니다.'}
            />
          )}
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

function monthAfter(date: Date, delta: number): [number, number] {
  const d = new Date(date.getFullYear(), date.getMonth() + delta, 1);
  return [d.getFullYear(), d.getMonth()];
}
