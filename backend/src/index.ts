import express, { type ErrorRequestHandler } from 'express';
import { API_PORT } from './config.ts';
import { loadUser } from './middleware/auth.ts';
import { authRouter } from './routes/auth.ts';
import { gamesRouter } from './routes/games.ts';
import { meRouter } from './routes/me.ts';
import { IS_SAMPLE_MODE } from './services/releases.ts';
import { HttpError } from './utils/http.ts';

const app = express();

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
  if (IS_SAMPLE_MODE) {
    console.log('RAWG_API_KEY가 설정되지 않아 샘플 데이터로 응답합니다. (backend/.env 참고)');
  }
});
