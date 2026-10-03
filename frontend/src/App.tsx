import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NavBar } from './components/NavBar';
import { RequireAuth } from './components/RequireAuth';
import { AuthProvider } from './contexts/AuthContext';
import { FavoritesProvider } from './contexts/FavoritesContext';
import { TasteProvider } from './contexts/TasteContext';
import { ToastProvider } from './contexts/ToastContext';
import { CalendarPage } from './pages/CalendarPage';
import { GotyPage } from './pages/GotyPage';
import { LibraryPage } from './pages/LibraryPage';
import { LoginPage } from './pages/LoginPage';
import { MyPage } from './pages/MyPage';
import { PopularPage } from './pages/PopularPage';
import { SearchPage } from './pages/SearchPage';
import { ShowcasePage } from './pages/ShowcasePage';
import { SignupPage } from './pages/SignupPage';

export default function App() {
  return (
    // 기본값(startTransition)이면 이동이 로그인 상태 변경보다 늦게 반영되어, 마이페이지에서 로그아웃·탈퇴할 때
    // RequireAuth가 먼저 로그인 페이지로 보내 버린다. Suspense를 쓰지 않으므로 끄고 동기적으로 반영한다.
    <BrowserRouter useTransitions={false}>
      <ToastProvider>
        <AuthProvider>
          <FavoritesProvider>
            <TasteProvider>
              <div className="app">
                <NavBar />
                <main>
                  <ErrorBoundary>
                    <Routes>
                      <Route path="/" element={<CalendarPage />} />
                      <Route path="/search" element={<SearchPage />} />
                      <Route path="/popular" element={<PopularPage />} />
                      <Route path="/goty" element={<GotyPage />} />
                      <Route path="/login" element={<LoginPage />} />
                      <Route path="/signup" element={<SignupPage />} />
                      <Route path="/u/:nickname" element={<ShowcasePage />} />
                      <Route
                        path="/library"
                        element={
                          <RequireAuth>
                            <LibraryPage />
                          </RequireAuth>
                        }
                      />
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
                  </ErrorBoundary>
                </main>
                <footer className="footer">
                  게임 데이터 제공:{' '}
                  <a href="https://rawg.io" target="_blank" rel="noreferrer">
                    RAWG
                  </a>
                </footer>
              </div>
            </TasteProvider>
          </FavoritesProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
