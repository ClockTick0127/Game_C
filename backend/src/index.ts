import express, { type ErrorRequestHandler } from 'express';
import { API_PORT } from './config.ts';
import { gamesRouter } from './routes/games.ts';
import { RawgApiError } from './services/rawg.ts';
import { IS_SAMPLE_MODE } from './services/releases.ts';

const app = express();

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, sample: IS_SAMPLE_MODE });
});
app.use('/api/games', gamesRouter);
app.use('/api', (_req, res) => {
  res.status(404).json({ error: '존재하지 않는 API입니다.' });
});

// Express 5는 async 핸들러에서 던진 에러도 여기로 전달한다
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof RawgApiError) {
    res.status(err.status).json({ error: err.message });
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
