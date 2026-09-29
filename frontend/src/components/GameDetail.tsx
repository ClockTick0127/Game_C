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
import { StoreSection } from './StoreSection';

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

/** 게임 상세 내용. 캘린더의 사이드 패널과 마이페이지의 모달에서 함께 쓴다. */
export function GameDetail({ game }: { game: Game }) {
  return (
    <>
      <GameThumb game={game} className="detail-hero" />
      <div className="detail-body">
        <h2 className="detail-title">{game.name}</h2>
        <p className="detail-sub">출시일 {formatKoreanDate(game.released)}</p>

        <dl className="detail-meta">
          <dt>플랫폼</dt>
          <dd>{game.platforms.length ? game.platforms.join(', ') : '정보 없음'}</dd>
          <dt>장르</dt>
          <dd>{game.genres.length ? game.genres.join(', ') : '정보 없음'}</dd>
          <dt>RAWG 평점</dt>
          <dd>{game.rating > 0 ? `★ ${game.rating.toFixed(1)} / 5` : '아직 없음'}</dd>
        </dl>

        {/* 샘플 게임(url 없음)은 RAWG에 없는 가상의 게임이라 스토어 정보가 없다 */}
        {game.url && (
          <StoreSection
            key={game.id}
            gameId={game.id}
            onPc={game.platforms.includes('PC')}
            rawgMetacritic={game.metacritic}
          />
        )}

        <div className="detail-actions">
          <FavoriteButton game={game} />
          {game.url && (
            <a className="detail-link" href={game.url} target="_blank" rel="noreferrer">
              RAWG에서 자세히 보기 ↗
            </a>
          )}
        </div>
      </div>
    </>
  );
}

export function GameDetailModal({ game, onClose }: { game: Game; onClose: () => void }) {
  return (
    <Modal title={game.name} onClose={onClose}>
      <GameDetail game={game} />
    </Modal>
  );
}
