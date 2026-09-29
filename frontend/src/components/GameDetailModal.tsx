import type { Game } from '../types';
import { formatKoreanDate } from '../utils/calendar';
import { GameThumb } from './GameThumb';
import { Modal } from './Modal';

interface Props {
  game: Game;
  onClose: () => void;
}

export function GameDetailModal({ game, onClose }: Props) {
  return (
    <Modal title={game.name} onClose={onClose}>
      <GameThumb game={game} className="detail-hero" />
      <div className="modal-body">
        <h2 className="modal-title">{game.name}</h2>
        <p className="modal-sub">출시일 {formatKoreanDate(game.released)}</p>

        <dl className="detail-meta">
          <dt>플랫폼</dt>
          <dd>{game.platforms.length ? game.platforms.join(', ') : '정보 없음'}</dd>
          <dt>장르</dt>
          <dd>{game.genres.length ? game.genres.join(', ') : '정보 없음'}</dd>
          <dt>평점</dt>
          <dd>{game.rating > 0 ? `★ ${game.rating.toFixed(1)} / 5` : '아직 없음'}</dd>
          {game.metacritic !== null && (
            <>
              <dt>메타크리틱</dt>
              <dd>{game.metacritic}</dd>
            </>
          )}
        </dl>

        {game.url && (
          <a className="detail-link" href={game.url} target="_blank" rel="noreferrer">
            RAWG에서 자세히 보기 ↗
          </a>
        )}
      </div>
    </Modal>
  );
}
