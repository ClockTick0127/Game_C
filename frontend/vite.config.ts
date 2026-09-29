import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** 백엔드 API 서버 주소 (backend/.env의 API_PORT와 맞춰야 한다) */
const API_SERVER = 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  // 개발 중에는 /api 요청을 백엔드로 넘겨 같은 출처처럼 동작하게 한다 (CORS 설정 불필요)
  server: { proxy: { '/api': API_SERVER } },
  preview: { proxy: { '/api': API_SERVER } },
});
