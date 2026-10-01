import { useState, type ReactNode } from 'react';
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

/** 관심 게임 추가·삭제. 로그인하지 않았으면 로그인 화면으로 보낸다 */
function useFavoriteToggle(game: Game) {
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

  return { user, active, pending, error, toggle: handleClick };
}

/** 패널 위쪽 막대에 놓는 별 모양 관심 게임 버튼 */
export function FavoriteStar({ game }: { game: Game }) {
  const { active, pending, error, toggle } = useFavoriteToggle(game);
  return (
    <>
      <button
        type="button"
        className={active ? 'panel-star active' : 'panel-star'}
        onClick={toggle}
        disabled={pending}
        aria-pressed={active}
        aria-label={active ? '관심 게임에서 삭제' : '관심 게임 추가'}
        title={active ? '관심 게임에서 삭제' : '관심 게임 추가'}
      >
        {active ? '★' : '☆'}
      </button>
      {error && (
        <span className="panel-star-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}

function FavoriteButton({ game }: { game: Game }) {
  const { user, active, pending, error, toggle } = useFavoriteToggle(game);
  // 관심 게임은 출시일로 정렬하고 캘린더에 표시하므로 출시일이 정해진 게임만 담을 수 있다 (이미 담은 게임은 뺄 수 있다)
  const undated = !game.released && !active;
  return (
    <>
      <button
        type="button"
        className={active ? 'btn fav-btn active' : 'btn fav-btn'}
        onClick={toggle}
        disabled={pending || undated}
        aria-pressed={active}
      >
        {active ? '★ 관심 게임' : '☆ 관심 게임 추가'}
      </button>
      {undated && <span className="muted small">출시일이 정해지면 관심 게임으로 담을 수 있어요</span>}
      {!user && !undated && <span className="muted small">로그인하면 관심 게임을 저장할 수 있어요</span>}
      {error && <p className="form-error">{error}</p>}
    </>
  );
}

/** 게임 상세 내용. 캘린더의 사이드 패널과 마이페이지의 모달에서 함께 쓴다. */
export function GameDetail({
  game,
  hideFavorite = false,
  actions,
}: {
  game: Game;
  hideFavorite?: boolean;
  /** 관심 게임 버튼 옆에 더할 버튼 (예: 서재에 추가) */
  actions?: ReactNode;
}) {
  return (
    <>
      <GameThumb game={game} className="detail-hero" />
      <div className="detail-body">
        <h2 className="detail-title">{game.name}</h2>
        <p className="detail-sub">출시일 {game.released ? formatKoreanDate(game.released) : '미정'}</p>

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
          {!hideFavorite && <FavoriteButton game={game} />}
          {actions}
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

export function GameDetailModal({ game, onClose, actions }: { game: Game; onClose: () => void; actions?: ReactNode }) {
  return (
    <Modal title={game.name} onClose={onClose}>
      <GameDetail game={game} actions={actions} />
    </Modal>
  );
}
