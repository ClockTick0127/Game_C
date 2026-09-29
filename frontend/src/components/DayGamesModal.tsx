import type { Game } from '../types';
import { formatKoreanDate } from '../utils/calendar';
import { GameThumb } from './GameThumb';
import { Modal } from './Modal';

interface Props {
  dateKey: string;
  games: Game[];
  onSelectGame: (game: Game) => void;
  onClose: () => void;
}

export function DayGamesModal({ dateKey, games, onSelectGame, onClose }: Props) {
  const title = formatKoreanDate(dateKey);
  return (
    <Modal title={title} onClose={onClose}>
      <div className="modal-body">
        <h2 className="modal-title">{title}</h2>
        <p className="modal-sub">게임 {games.length}개</p>
        <ul className="day-list">
          {games.map((game) => (
            <li key={game.id}>
              <button type="button" className="day-item" onClick={() => onSelectGame(game)}>
                <GameThumb game={game} className="day-thumb" />
                <span className="day-info">
                  <strong>{game.name}</strong>
                  <span>{game.platforms.slice(0, 3).join(' · ') || '플랫폼 정보 없음'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
