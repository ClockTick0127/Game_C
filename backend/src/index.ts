import { app, SERVE_FRONTEND } from './app.ts';
import { API_PORT } from './config.ts';
import { IS_SAMPLE_MODE } from './services/releases.ts';
import { purgeExpiredSessions } from './services/sessions.ts';

/** 만료 세션 정리 주기 */
const SESSION_PURGE_INTERVAL_MS = 60 * 60 * 1000;

function purgeSessions(): void {
  try {
    const count = purgeExpiredSessions();
    if (count > 0) console.log(`만료된 세션 ${count}개를 정리했습니다.`);
  } catch (err) {
    console.error('만료 세션 정리 실패', err);
  }
}
purgeSessions(); // 오래 꺼져 있던 서버는 시작할 때 한 번 정리한다
// unref: 이 타이머 때문에 프로세스 종료가 지연되지 않게 한다
setInterval(purgeSessions, SESSION_PURGE_INTERVAL_MS).unref();

app.listen(API_PORT, () => {
  console.log(`API 서버 실행 중: http://localhost:${API_PORT}`);
  if (SERVE_FRONTEND) console.log('빌드된 프론트엔드를 함께 서빙합니다.');
  if (IS_SAMPLE_MODE) {
    console.log('RAWG_API_KEY가 설정되지 않아 샘플 데이터로 응답합니다. (backend/.env 참고)');
  }
});
