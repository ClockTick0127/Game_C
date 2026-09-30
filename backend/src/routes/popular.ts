import { Router } from 'express';
import { gamesLimiter } from '../middleware/rateLimit.ts';
import { getKrwRate } from '../services/exchangeRate.ts';
import { ensureFresh, GENRES, PLATFORMS, queryPopular, type Platform } from '../services/popular.ts';
import { HttpError } from '../utils/http.ts';

export const popularRouter = Router();

const PAGE_SIZE = 30;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * GET /api/popular?q=&genre=&year=&platform=&sort=owners|ccu&page=
 * 첫 요청이 데이터 수집을 시작하며(수십 초), 그동안은 status.ready가 false인 빈 목록을 돌려준다.
 */
popularRouter.get('/', gamesLimiter, async (req, res) => {
  const genre = text(req.query.genre) || null;
  if (genre && !(GENRES as readonly string[]).includes(genre)) throw new HttpError(400, '장르가 올바르지 않습니다.');

  const platform = text(req.query.platform) || null;
  if (platform && !(PLATFORMS as readonly string[]).includes(platform)) {
    throw new HttpError(400, '플랫폼이 올바르지 않습니다.');
  }

  const yearText = text(req.query.year);
  const year = yearText ? Number(yearText) : null;
  if (year !== null && !(Number.isInteger(year) && year >= 1970 && year <= 2100)) {
    throw new HttpError(400, '출시 연도가 올바르지 않습니다.');
  }

  const sort = text(req.query.sort) || 'owners';
  if (sort !== 'owners' && sort !== 'ccu') throw new HttpError(400, '정렬 기준이 올바르지 않습니다.');

  const page = Number(text(req.query.page) || 1);
  if (!Number.isInteger(page) || page < 1 || page > 1000) throw new HttpError(400, '페이지가 올바르지 않습니다.');

  const q = text(req.query.q);
  if (q.length > 50) throw new HttpError(400, '검색어는 50자 이하로 입력하세요.');

  ensureFresh();
  const exchange = await getKrwRate();
  res.json({
    ...queryPopular({ q, genre, year, platform: platform as Platform | null, sort, page, pageSize: PAGE_SIZE }),
    exchange,
  });
});
