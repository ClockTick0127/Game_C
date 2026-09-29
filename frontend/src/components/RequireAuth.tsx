import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { loginPath } from '../utils/redirect';

/** 로그인해야 볼 수 있는 페이지. 로그인하지 않았으면 로그인 페이지로 보낸 뒤 다시 돌아오게 한다. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p className="page-status">로그인 상태를 확인하는 중…</p>;
  if (!user) return <Navigate to={loginPath(location.pathname + location.search)} replace />;
  return children;
}
