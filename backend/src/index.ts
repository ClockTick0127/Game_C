import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { API_PORT, FRONTEND_DIST, TRUST_PROXY } from './config.ts';
import { loadUser } from './middleware/auth.ts';
import { apiLimiter } from './middleware/rateLimit.ts';
import { authRouter } from './routes/auth.ts';
import { gamesRouter } from './routes/games.ts';
import { meRouter } from './routes/me.ts';
import { IS_SAMPLE_MODE } from './services/releases.ts';
import { HttpError } from './utils/http.ts';

const app = express();

app.disable('x-powered-by');
if (TRUST_PROXY > 0) app.set('trust proxy', TRUST_PROXY);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        // 게임 이미지는 RAWG·Steam 등 외부 https 도메인에서 온다
        'img-src': ["'self'", 'data:', 'https:'],
        // HTTPS 없이(예: 로컬 프로덕션 테스트) 띄워도 정적 파일 요청이 깨지지 않게 한다
        'upgrade-insecure-requests': null,
      },
    },
  }),
);
app.use('/api', apiLimiter);
app.use(express.json({ limit: '20kb' }));
app.use(loadUser);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, sample: IS_SAMPLE_MODE });
});
app.use('/api/games', gamesRouter);
app.use('/api/auth', authRouter);
app.use('/api/me', meRouter);
app.use('/api', (_req, res) => {
  res.status(404).json({ error: '존재하지 않는 API입니다.' });
});

// 프로덕션: 빌드된 프론트엔드를 함께 서빙하고, 그 외 GET 요청은 SPA 라우팅을 위해 index.html로 보낸다
const SERVE_FRONTEND = existsSync(join(FRONTEND_DIST, 'index.html'));
if (SERVE_FRONTEND) {
  app.use(express.static(FRONTEND_DIST, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(join(FRONTEND_DIST, 'index.html'));
  });
}

// Express 5는 async 핸들러에서 던진 에러도 여기로 전달한다
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // express.json()이 던지는 오류 (JSON 문법 오류, 본문 크기 초과 등)
  if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
    res.status(err.status).json({ error: '요청 본문이 올바르지 않습니다.' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
};
app.use(errorHandler);

app.listen(API_PORT, () => {
  console.log(`API 서버 실행 중: http://localhost:${API_PORT}`);
  if (SERVE_FRONTEND) console.log('빌드된 프론트엔드를 함께 서빙합니다.');
  if (IS_SAMPLE_MODE) {
    console.log('RAWG_API_KEY가 설정되지 않아 샘플 데이터로 응답합니다. (backend/.env 참고)');
  }
});
