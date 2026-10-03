import { useFavorites } from '../contexts/FavoritesContext';
import type { Game } from '../types';
import { DDay } from './DDay';
import { GameThumb } from './GameThumb';

interface Props {
  game: Game;
  /** 이름 아래에 적는 한 줄 (연도·플랫폼 등) */
  summary: string;
  /** 그 아래에 강조해서 적는 한 줄 (추천 이유 등). 없으면 그리지 않는다 */
  note?: string;
  onOpen: (game: Game) => void;
}

/** 게임 검색 결과·추천에 쓰는 한 줄짜리 게임 카드. 누르면 상세를 연다 */
export function GameListItem({ game, summary, note, onOpen }: Props) {
  const { isFavorite } = useFavorites();
  return (
    <button type="button" className="list-item" onClick={() => onOpen(game)}>
      <GameThumb game={game} className="day-thumb" />
      <span className="day-info">
        <strong>
          {game.name}
          {isFavorite(game.id) && (
            <span className="list-star" aria-label="관심 게임">
              {' '}
              ★
            </span>
          )}
        </strong>
        <span>{summary}</span>
        {note && <span className="suggest-note">{note}</span>}
      </span>
      {game.released && <DDay released={game.released} />}
    </button>
  );
}
