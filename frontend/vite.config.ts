import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** 백엔드 API 서버 주소 (backend/.env의 API_PORT와 맞춰야 한다) */
const API_SERVER = 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  // 개발 중에는 /api 요청을 백엔드로 넘겨 같은 출처처럼 동작하게 한다 (CORS 설정 불필요)
  server: { proxy: { '/api': API_SERVER } },
  preview: { proxy: { '/api': API_SERVER } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // 테스트가 끝나면 vi.spyOn과 vi.stubGlobal로 바꿔 둔 것을 원래대로 돌려놓는다
    restoreMocks: true,
    unstubGlobals: true,
  },
});
