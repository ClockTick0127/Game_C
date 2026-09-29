import { Router } from 'express';
import { buildFeedByToken } from '../services/calendarFeed.ts';
import { HttpError } from '../utils/http.ts';

/** 캘린더 앱이 구독하는 공개 주소. 로그인 쿠키 대신 주소에 든 토큰으로 사용자를 구분한다. */
export const calendarRouter = Router();

/** GET /api/calendar/:token.ics */
calendarRouter.get('/:file', (req, res) => {
  const file = req.params.file;
  const ics = file.endsWith('.ics') ? buildFeedByToken(file.slice(0, -'.ics'.length)) : null;
  if (ics === null) throw new HttpError(404, '존재하지 않는 캘린더입니다.');

  res.type('text/calendar; charset=utf-8').set('Cache-Control', 'private, max-age=300').send(ics);
});
