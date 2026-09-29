import { Link, NavLink, useNavigate } from 'react-router';
import { errorMessage } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export function NavBar() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    // 홈으로 먼저 이동해야 마이페이지에서 로그아웃할 때 RequireAuth가 로그인 페이지로 보내지 않는다 (App의 useTransitions 참고)
    navigate('/');
    try {
      await logout();
    } catch (err) {
      alert(`로그아웃에 실패했습니다: ${errorMessage(err)}`);
    }
  };

  return (
    <header className="topbar">
      <Link to="/" className="brand">
        게임 캘린더
      </Link>
      <nav className="topbar-nav topbar-menu">
        <NavLink to="/" end className="nav-link">
          캘린더
        </NavLink>
        <NavLink to="/goty" className="nav-link">
          역대 GOTY
        </NavLink>
      </nav>
      {/* 로그인 상태를 확인하는 동안에는 버튼이 깜빡이지 않도록 비워둔다 */}
      {!loading && (
        <nav className="topbar-nav">
          {user ? (
            <>
              <NavLink to="/mypage" className="nav-link">
                {user.nickname}님
              </NavLink>
              <button type="button" className="nav-link" onClick={handleLogout}>
                로그아웃
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className="nav-link">
                로그인
              </NavLink>
              <NavLink to="/signup" className="btn btn-primary btn-sm">
                회원가입
              </NavLink>
            </>
          )}
        </nav>
      )}
    </header>
  );
}
