import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as authApi from '../api/auth';
import { UNAUTHORIZED_EVENT } from '../api/client';
import type { User } from '../types';

interface AuthValue {
  user: User | null;
  /** 첫 로그인 상태 확인이 끝나기 전에는 true */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, nickname: string) => Promise<void>;
  logout: () => Promise<void>;
  /** 프로필 수정·회원 탈퇴 후 화면의 사용자 정보를 갱신할 때 사용 */
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi
      .fetchMe()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));

    // 세션이 만료된 채로 API를 부르면 로그아웃 상태로 전환
    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const value: AuthValue = {
    user,
    loading,
    login: async (email, password) => setUser((await authApi.login(email, password)).user),
    signup: async (email, password, nickname) => setUser((await authApi.signup(email, password, nickname)).user),
    logout: async () => {
      await authApi.logout();
      setUser(null);
    },
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있습니다.');
  return value;
}
