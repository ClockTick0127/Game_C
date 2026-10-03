import { useFavorites } from '../contexts/FavoritesContext';
import { useTaste } from '../contexts/TasteContext';
import type { Game } from '../types';
import { buildCalendarDays, toDateKey, WEEKDAYS } from '../utils/calendar';
import { GameThumb } from './GameThumb';

/** 칸 하나에 바로 보여줄 최대 게임 수. 나머지는 "+N"으로 접는다. */
const MAX_VISIBLE = 3;

interface Props {
  year: number;
  month: number;
  gamesByDate: Map<string, Game[]>;
  /** 패널에 열려 있는 게임·날짜 (강조 표시용) */
  selectedGameId: number | null;
  selectedDay: string | null;
  onSelectGame: (game: Game) => void;
  onSelectDay: (dateKey: string) => void;
}

export function CalendarGrid({
  year,
  month,
  gamesByDate,
  selectedGameId,
  selectedDay,
  onSelectGame,
  onSelectDay,
}: Props) {
  const { isFavorite } = useFavorites();
  const taste = useTaste();
  const days = buildCalendarDays(year, month);
  const todayKey = toDateKey(new Date());

  return (
    <div className="cal-grid">
      {WEEKDAYS.map((w, i) => (
        <div key={w} className={`cal-weekday ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>
          {w}
        </div>
      ))}

      {days.map((day) => {
        const games = day.inMonth ? (gamesByDate.get(day.key) ?? []) : [];
        const hidden = games.length - MAX_VISIBLE;
        const weekday = day.date.getDay();
        const classes = [
          'cal-cell',
          !day.inMonth && 'outside',
          day.key === todayKey && 'today',
          games.length > 0 && 'has-games',
          day.key === selectedDay && 'selected',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <div key={day.key} className={classes}>
            <button
              type="button"
              className={`cal-date ${weekday === 0 ? 'sun' : weekday === 6 ? 'sat' : ''}`}
              onClick={() => games.length > 0 && onSelectDay(day.key)}
              disabled={games.length === 0}
              aria-label={`${day.date.getMonth() + 1}월 ${day.date.getDate()}일, 게임 ${games.length}개`}
            >
              {day.date.getDate()}
              {games.length > 0 && <span className="cal-badge">{games.length}</span>}
            </button>

            <ul className="cal-games">
              {games.slice(0, MAX_VISIBLE).map((game) => (
                <li key={game.id}>
                  <button
                    type="button"
                    className={[
                      'game-chip',
                      isFavorite(game.id) && 'favorite',
                      taste.match(game) && 'taste',
                      game.id === selectedGameId && 'selected',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => onSelectGame(game)}
                    title={game.name}
                    aria-pressed={game.id === selectedGameId}
                  >
                    <GameThumb game={game} className="chip-thumb" />
                    <span className="chip-name">{game.name}</span>
                    {taste.match(game) && (
                      <span className="chip-taste" role="img" aria-label="취향에 맞는 게임">
                        ✦
                      </span>
                    )}
                    {isFavorite(game.id) && (
                      <span className="chip-star" aria-label="관심 게임">
                        ★
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {hidden > 0 && (
                <li>
                  <button type="button" className="more-chip" onClick={() => onSelectDay(day.key)}>
                    +{hidden}개 더보기
                  </button>
                </li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
