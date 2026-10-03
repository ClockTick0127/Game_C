import { useFavorites } from '../contexts/FavoritesContext';
import { useTaste } from '../contexts/TasteContext';
import type { Game } from '../types';
import { formatKoreanDate, toDateKey } from '../utils/calendar';
import { DDay } from './DDay';
import { GameThumb } from './GameThumb';

interface Props {
  gamesByDate: Map<string, Game[]>;
  selectedGameId: number | null;
  onSelectGame: (game: Game) => void;
  /** 표시할 게임이 하나도 없을 때 보여줄 문구 (비어 있으면 아무것도 그리지 않는다) */
  emptyMessage: string;
}

/** 출시일 순 목록 (아젠다). 모바일에서 월간 격자보다 훨씬 읽기 쉽다. */
export function ListView({ gamesByDate, selectedGameId, onSelectGame, emptyMessage }: Props) {
  const { isFavorite } = useFavorites();
  const taste = useTaste();
  const todayKey = toDateKey(new Date());
  // YYYY-MM-DD 형식이라 문자열 정렬이 곧 날짜 정렬이다
  const dateKeys = [...gamesByDate.keys()].sort();

  if (dateKeys.length === 0) return emptyMessage ? <p className="muted list-empty">{emptyMessage}</p> : null;

  return (
    <div className="list-view">
      {dateKeys.map((key) => (
        <section key={key} className={key === todayKey ? 'list-day today' : 'list-day'}>
          <h3 className="list-day-head">
            {formatKoreanDate(key)}
            {key === todayKey && <span className="list-today">오늘</span>} <DDay released={key} />
          </h3>
          <ul className="list-games">
            {gamesByDate.get(key)!.map((game) => (
              <li key={game.id}>
                <button
                  type="button"
                  className={game.id === selectedGameId ? 'list-item selected' : 'list-item'}
                  onClick={() => onSelectGame(game)}
                  aria-pressed={game.id === selectedGameId}
                >
                  <GameThumb game={game} className="day-thumb" />
                  <span className="day-info">
                    <strong>
                      {game.name}
                      {taste.match(game) && (
                        <span className="list-taste" role="img" aria-label="취향에 맞는 게임">
                          {' '}
                          ✦
                        </span>
                      )}
                      {isFavorite(game.id) && (
                        <span className="list-star" aria-label="관심 게임">
                          {' '}
                          ★
                        </span>
                      )}
                    </strong>
                    <span>
                      {[game.platforms.slice(0, 3).join(' · '), game.genres.slice(0, 2).join(' · ')]
                        .filter(Boolean)
                        .join(' | ')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
