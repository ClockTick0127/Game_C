import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { NavBar } from './components/NavBar';
import { RequireAuth } from './components/RequireAuth';
import { AuthProvider } from './contexts/AuthContext';
import { FavoritesProvider } from './contexts/FavoritesContext';
import { CalendarPage } from './pages/CalendarPage';
import { GotyPage } from './pages/GotyPage';
import { LoginPage } from './pages/LoginPage';
import { MyPage } from './pages/MyPage';
import { SignupPage } from './pages/SignupPage';

export default function App() {
  return (
    // 기본값(startTransition)이면 이동이 로그인 상태 변경보다 늦게 반영되어, 마이페이지에서 로그아웃·탈퇴할 때
    // RequireAuth가 먼저 로그인 페이지로 보내 버린다. Suspense를 쓰지 않으므로 끄고 동기적으로 반영한다.
    <BrowserRouter useTransitions={false}>
      <AuthProvider>
        <FavoritesProvider>
          <div className="app">
            <NavBar />
            <main>
              <Routes>
                <Route path="/" element={<CalendarPage />} />
                <Route path="/goty" element={<GotyPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route
                  path="/mypage"
                  element={
                    <RequireAuth>
                      <MyPage />
                    </RequireAuth>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
            <footer className="footer">
              게임 데이터 제공:{' '}
              <a href="https://rawg.io" target="_blank" rel="noreferrer">
                RAWG
              </a>
            </footer>
          </div>
        </FavoritesProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
