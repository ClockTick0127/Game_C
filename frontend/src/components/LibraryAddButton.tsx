import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { errorMessage } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import type { Game } from '../types';
import { loginPath } from '../utils/redirect';

interface Props {
  game: Game;
  /** 이미 서재에 직접 추가한 게임인지. 아직 모르면(목록을 불러오는 중) null */
  added: boolean | null;
  /** 서버에 저장되면 끝나는 추가 동작 */
  onAdd: (game: Game) => Promise<void>;
}

/** 게임 상세의 "내 서재에 추가" 버튼. 로그인하지 않았으면 로그인 화면으로 보낸다 */
export function LibraryAddButton({ game, added, onAdd }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (!user) {
      navigate(loginPath(location.pathname + location.search));
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onAdd(game);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  // 로그인했으면 이미 추가했거나(true) 아직 모르는(null) 동안은 누를 수 없다. 로그인하지 않았으면 눌러서 로그인으로 간다
  const done = Boolean(user) && added === true;
  const disabled = pending || done || (Boolean(user) && added === null);
  return (
    <>
      <button type="button" className="btn" onClick={handleClick} disabled={disabled}>
        {done ? '✓ 서재에 추가됨' : pending ? '추가하는 중…' : '＋ 내 서재에 추가'}
      </button>
      {done && !user?.steamId && (
        <span className="muted small">
          서재는 Steam 연동 후 볼 수 있어요. <Link to="/mypage">마이페이지</Link>
        </span>
      )}
      {error && <p className="form-error">{error}</p>}
    </>
  );
}
