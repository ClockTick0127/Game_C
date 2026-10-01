import { Router } from 'express';
import { steamDataLimiter } from '../middleware/rateLimit.ts';
import { getShowcase } from '../services/showcase.ts';
import { HttpError } from '../utils/http.ts';

/** 로그인 없이 볼 수 있는 공개 프로필 API. 사용자가 공개를 켠 진열장만 나온다 */
export const profilesRouter = Router();

/** GET /api/profiles/:nickname/showcase — 공개한 진열장. 공개하지 않았거나 없는 닉네임이면 404 */
profilesRouter.get('/:nickname/showcase', steamDataLimiter, async (req, res) => {
  const nickname = String(req.params.nickname);
  // 닉네임은 2~20자다. 터무니없이 긴 값은 조회하지 않고 없는 것으로 본다
  if (nickname.length > 20) throw new HttpError(404, '공개된 진열장을 찾을 수 없습니다.');
  // 공개를 끄면 바로 사라져야 하므로 브라우저·프록시가 보관하지 않게 한다
  res.set('Cache-Control', 'no-store');
  res.json(await getShowcase(nickname));
});
