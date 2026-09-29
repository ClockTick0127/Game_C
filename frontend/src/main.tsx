import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { applyTheme, readStoredTheme } from './utils/theme';

// 첫 화면이 그려지기 전에 저장된 테마를 적용해, 라이트를 골라 둔 사용자에게 어두운 화면이 번쩍이지 않게 한다
applyTheme(readStoredTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
