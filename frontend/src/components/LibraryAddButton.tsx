import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { errorMessage } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import type { Game } from '../types';
import { loginPath } from '../utils/redirect';

/** 이 게임이 서재에 어떻게 있는지. loading은 아직 모르는 상태, steam은 Steam 보유 게임(이미 서재에 꽂혀 있다) */
export type LibraryStatus = 'loading' | 'none' | 'added' | 'steam';

interface Props {
  game: Game;
  status: LibraryStatus;
  /** 서버에 저장되면 끝나는 추가 동작 */
  onAdd: (game: Game) => Promise<void>;
}

/** 게임 상세의 "내 서재에 추가" 버튼. 로그인하지 않았으면 로그인 화면으로 보낸다 */
export function LibraryAddButton({ game, status, onAdd }: Props) {
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

  // 로그인했으면 이미 서재에 있거나 아직 모르는 동안은 누를 수 없다. 로그인하지 않았으면 눌러서 로그인으로 간다
  const done = Boolean(user) && status === 'added';
  const owned = Boolean(user) && status === 'steam';
  const disabled = pending || done || owned || (Boolean(user) && status === 'loading');
  return (
    <>
      <button type="button" className="btn" onClick={handleClick} disabled={disabled}>
        {owned ? '✓ Steam 보유 게임' : done ? '✓ 서재에 추가됨' : pending ? '추가하는 중…' : '＋ 내 서재에 추가'}
      </button>
      {owned && <span className="muted small">Steam으로 이미 가진 게임이라 서재에 꽂혀 있어요</span>}
      {done && !user?.steamId && (
        <span className="muted small">
          서재는 Steam 연동 후 볼 수 있어요. <Link to="/mypage">마이페이지</Link>
        </span>
      )}
      {error && <p className="form-error">{error}</p>}
    </>
  );
}
