import { Router } from 'express';
import { getReleases } from '../services/releases.ts';
import { getStoreInfo } from '../services/storeInfo.ts';
import { daysBetween, isDateKey } from '../utils/date.ts';

/** 한 번에 조회할 수 있는 최대 기간 (캘린더 한 화면 + 여유) */
const MAX_RANGE_DAYS = 62;

export const gamesRouter = Router();

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
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: '게임 ID가 올바르지 않습니다.' });
    return;
  }
  res.json(await getStoreInfo(id));
});
