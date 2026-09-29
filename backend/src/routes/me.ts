import { Router } from 'express';
import { clearSessionCookie, currentUser, requireAuth } from '../middleware/auth.ts';
import { sensitiveLimiter } from '../middleware/rateLimit.ts';
import { addFavorite, listFavorites, removeFavorite } from '../services/favorites.ts';
import { hashPassword, verifyPassword } from '../services/password.ts';
import { deleteOtherSessions } from '../services/sessions.ts';
import { deleteUser, findUserRowById, updateNickname, updatePasswordHash } from '../services/users.ts';
import { HttpError } from '../utils/http.ts';
import { parseGame, requireText, validateNickname, validatePassword } from '../utils/validate.ts';

/** 로그인한 사용자 본인의 정보를 다루는 API (마이페이지) */
export const meRouter = Router();
meRouter.use(requireAuth);

/** 현재 비밀번호 확인이 필요한 작업에서 사용. 틀려도 로그아웃된 것은 아니므로 401이 아닌 400을 쓴다. */
async function assertPassword(userId: number, password: unknown): Promise<void> {
  const input = requireText(password, '현재 비밀번호를 입력하세요.');
  if (!(await verifyPassword(input, findUserRowById(userId)?.password_hash))) {
    throw new HttpError(400, '현재 비밀번호가 올바르지 않습니다.');
  }
}

function parseGameId(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, '게임 ID가 올바르지 않습니다.');
  return id;
}

/** PATCH /api/me { nickname } */
meRouter.patch('/', (req, res) => {
  const user = currentUser(req);
  res.json({ user: updateNickname(user.id, validateNickname(req.body?.nickname)) });
});

/** PUT /api/me/password { currentPassword, newPassword } — 다른 기기의 로그인은 해제된다 */
meRouter.put('/password', sensitiveLimiter, async (req, res) => {
  const user = currentUser(req);
  await assertPassword(user.id, req.body?.currentPassword);
  const newPassword = validatePassword(req.body?.newPassword, '새 비밀번호');

  updatePasswordHash(user.id, await hashPassword(newPassword));
  deleteOtherSessions(user.id, req.sessionToken!);
  res.status(204).end();
});

/** DELETE /api/me { password } — 회원 탈퇴 */
meRouter.delete('/', sensitiveLimiter, async (req, res) => {
  const user = currentUser(req);
  await assertPassword(user.id, req.body?.password);

  deleteUser(user.id);
  clearSessionCookie(res);
  res.status(204).end();
});

/** GET /api/me/favorites — 출시일 순 관심 게임 목록 */
meRouter.get('/favorites', (req, res) => {
  res.json({ games: listFavorites(currentUser(req).id) });
});

/** PUT /api/me/favorites/:gameId (본문: Game) — 여러 번 호출해도 결과가 같다 */
meRouter.put('/favorites/:gameId', (req, res) => {
  const gameId = parseGameId(req.params.gameId);
  const game = parseGame(req.body);
  if (game.id !== gameId) throw new HttpError(400, '게임 ID가 일치하지 않습니다.');

  addFavorite(currentUser(req).id, game);
  res.status(204).end();
});

/** DELETE /api/me/favorites/:gameId */
meRouter.delete('/favorites/:gameId', (req, res) => {
  removeFavorite(currentUser(req).id, parseGameId(req.params.gameId));
  res.status(204).end();
});
