import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { errorMessage } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useFavorites } from '../contexts/FavoritesContext';
import type { Game } from '../types';
import { formatKoreanDate } from '../utils/calendar';
import { loginPath } from '../utils/redirect';
import { GameThumb } from './GameThumb';
import { Modal } from './Modal';

interface Props {
  game: Game;
  onClose: () => void;
}

function FavoriteButton({ game }: { game: Game }) {
  const { user } = useAuth();
  const { isFavorite, toggle } = useFavorites();
  const navigate = useNavigate();
  const location = useLocation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = isFavorite(game.id);

  const handleClick = async () => {
    if (!user) {
      navigate(loginPath(location.pathname + location.search));
      return;
    }
    setPending(true);
    setError(null);
    try {
      await toggle(game);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={active ? 'btn fav-btn active' : 'btn fav-btn'}
        onClick={handleClick}
        disabled={pending}
        aria-pressed={active}
      >
        {active ? '★ 관심 게임' : '☆ 관심 게임 추가'}
      </button>
      {!user && <span className="muted small">로그인하면 관심 게임을 저장할 수 있어요</span>}
      {error && <p className="form-error">{error}</p>}
    </>
  );
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

        <div className="detail-actions">
          <FavoriteButton game={game} />
          {game.url && (
            <a className="detail-link" href={game.url} target="_blank" rel="noreferrer">
              RAWG에서 자세히 보기 ↗
            </a>
          )}
        </div>
      </div>
    </Modal>
  );
}
