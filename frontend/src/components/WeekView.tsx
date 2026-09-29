import { useFavorites } from '../contexts/FavoritesContext';
import type { Game } from '../types';
import { toDateKey, WEEKDAYS, type CalendarDay } from '../utils/calendar';
import { GameThumb } from './GameThumb';

interface Props {
  /** 일요일부터 토요일까지 7일 */
  days: CalendarDay[];
  gamesByDate: Map<string, Game[]>;
  selectedGameId: number | null;
  selectedDay: string | null;
  onSelectGame: (game: Game) => void;
  onSelectDay: (dateKey: string) => void;
}

/** 한 주를 요일별 세로 목록으로 보여준다. 월간 보기와 달리 게임을 접지 않고 모두 보여준다. */
export function WeekView({ days, gamesByDate, selectedGameId, selectedDay, onSelectGame, onSelectDay }: Props) {
  const { isFavorite } = useFavorites();
  const todayKey = toDateKey(new Date());

  return (
    <div className="week-view">
      {days.map((day) => {
        const games = gamesByDate.get(day.key) ?? [];
        const weekday = day.date.getDay();
        const classes = ['week-day', day.key === todayKey && 'today', day.key === selectedDay && 'selected']
          .filter(Boolean)
          .join(' ');

        return (
          <section
            key={day.key}
            className={classes}
            aria-label={`${day.date.getMonth() + 1}월 ${day.date.getDate()}일`}
          >
            <button
              type="button"
              className={`week-day-head ${weekday === 0 ? 'sun' : weekday === 6 ? 'sat' : ''}`}
              onClick={() => games.length > 0 && onSelectDay(day.key)}
              disabled={games.length === 0}
              aria-label={`${day.date.getMonth() + 1}월 ${day.date.getDate()}일 ${WEEKDAYS[weekday]}요일, 게임 ${games.length}개`}
            >
              <span>{WEEKDAYS[weekday]}</span>
              <strong>{day.date.getDate()}</strong>
            </button>

            {games.length === 0 ? (
              <p className="week-empty" aria-hidden="true">
                –
              </p>
            ) : (
              <ul className="week-games">
                {games.map((game) => (
                  <li key={game.id}>
                    <button
                      type="button"
                      className={[
                        'game-chip',
                        isFavorite(game.id) && 'favorite',
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
                      {isFavorite(game.id) && (
                        <span className="chip-star" aria-label="관심 게임">
                          ★
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
