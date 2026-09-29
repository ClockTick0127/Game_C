import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { AuthProvider } from '../contexts/AuthContext';
import { FavoritesProvider } from '../contexts/FavoritesContext';
import { ToastProvider } from '../contexts/ToastContext';

/** 현재 경로를 화면에 보여 주는 표식. 이동(navigate) 결과를 테스트에서 확인할 때 쓴다. */
function LocationDisplay() {
  const { pathname, search } = useLocation();
  return <div data-testid="location">{pathname + search}</div>;
}

/**
 * 앱과 같은 Provider(라우터·토스트·로그인·관심 게임)로 감싸서 렌더링한다.
 * api/auth, api/me는 테스트에서 vi.mock으로 대신하고, 로그인 여부는 fetchMe의 응답으로 정한다.
 */
export function renderApp(ui: ReactNode, { route = '/', path = '*' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ToastProvider>
        <AuthProvider>
          <FavoritesProvider>
            <Routes>
              <Route path={path} element={ui} />
              <Route path="*" element={null} />
            </Routes>
            <LocationDisplay />
          </FavoritesProvider>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}
