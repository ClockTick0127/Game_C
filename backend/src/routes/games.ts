import { Router } from 'express';
import { gamesLimiter } from '../middleware/rateLimit.ts';
import { IS_SAMPLE_MODE, getReleases } from '../services/releases.ts';
import { searchGamesAny } from '../services/koreanSearch.ts';
import { searchGameByName } from '../services/rawg.ts';
import type { Game } from '../types.ts';
import { createPromiseCache } from '../utils/cache.ts';
import { getStoreInfo } from '../services/storeInfo.ts';
import { daysBetween, isDateKey } from '../utils/date.ts';

/** 한 번에 조회할 수 있는 최대 기간 (캘린더 한 화면 + 여유) */
const MAX_RANGE_DAYS = 62;

export const gamesRouter = Router();
gamesRouter.use(gamesLimiter);

/** 이름 검색 결과 캐시 (24시간). 수상작처럼 같은 이름을 반복해서 찾는 용도라 길게 잡는다. */
const cachedSearch = createPromiseCache<string, Game | null>({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 200 });

/** GET /api/games?start=YYYY-MM-DD&end=YYYY-MM-DD — 기간 내 출시 게임 목록 */
gamesRouter.get('/', async (req, res) => {
  const { start, end } = req.query;

  if (typeof start !== 'string' || typeof end !== 'string' || !isDateKey(start) || !isDateKey(end)) {
    res.status(400).json({ error: 'start, end 쿼리를 YYYY-MM-DD 형식으로 보내주세요.' });
    return;
  }
  if (start > end) {
    res.status(400).json({ error: 'start는 end보다 이후일 수 없습니다.' });
    return;
  }
  if (daysBetween(start, end) > MAX_RANGE_DAYS) {
    res.status(400).json({ error: `조회 기간은 최대 ${MAX_RANGE_DAYS}일입니다.` });
    return;
  }

  res.json(await getReleases(start, end));
});

/** GET /api/games/:id/store-info — 스토어 바로가기 링크와 Steam 사용자 평가 */
gamesRouter.get('/:id/store-info', async (req, res) => {
  // "1e3", "0x10" 같은 값을 Number()가 숫자로 받아들이지 않도록 자릿수만 허용한다
  const id = /^\d{1,15}$/.test(req.params.id) ? Number(req.params.id) : 0;
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: '게임 ID가 올바르지 않습니다.' });
    return;
  }
  res.json(await getStoreInfo(id));
});

/** GET /api/games/find?q=... — 이름으로 찾은 게임 목록 (로그인 불필요, 한글 검색어 지원). 샘플 모드에서는 503 */
gamesRouter.get('/find', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q || q.length > 100) {
    res.status(400).json({ error: '검색어를 1~100자로 입력하세요.' });
    return;
  }
  if (IS_SAMPLE_MODE) {
    res.status(503).json({ error: '샘플 모드에서는 게임을 검색할 수 없습니다.' });
    return;
  }
  res.json({ games: await searchGamesAny(q) });
});

/** GET /api/games/search?name=...&year=... — 이름(과 선택적으로 출시 연도)으로 찾은 게임 하나. 샘플 모드이거나 찾지 못하면 404 */
gamesRouter.get('/search', async (req, res) => {
  const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
  if (!name || name.length > 100) {
    res.status(400).json({ error: 'name 쿼리를 1~100자로 보내주세요.' });
    return;
  }
  if (IS_SAMPLE_MODE) {
    res.status(404).json({ error: '샘플 모드에서는 게임을 검색할 수 없습니다.' });
    return;
  }
  const year = Number(req.query.year);
  const yearHint = Number.isInteger(year) && year >= 1970 && year <= 2100 ? year : undefined;
  const game = await cachedSearch(`${name.toLowerCase()}|${yearHint ?? ''}`, () => searchGameByName(name, yearHint));
  if (!game) {
    res.status(404).json({ error: '게임을 찾을 수 없습니다.' });
    return;
  }
  res.json(game);
});
