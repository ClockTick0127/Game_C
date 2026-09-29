import { app, SERVE_FRONTEND } from './app.ts';
import { API_PORT } from './config.ts';
import { IS_SAMPLE_MODE } from './services/releases.ts';

app.listen(API_PORT, () => {
  console.log(`API 서버 실행 중: http://localhost:${API_PORT}`);
  if (SERVE_FRONTEND) console.log('빌드된 프론트엔드를 함께 서빙합니다.');
  if (IS_SAMPLE_MODE) {
    console.log('RAWG_API_KEY가 설정되지 않아 샘플 데이터로 응답합니다. (backend/.env 참고)');
  }
});
