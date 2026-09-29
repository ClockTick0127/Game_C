import { Router } from 'express';
import { clearSessionCookie, currentUser, requireAuth, startSession } from '../middleware/auth.ts';
import { loginLimiter, signupLimiter } from '../middleware/rateLimit.ts';
import { hashPassword, verifyPassword } from '../services/password.ts';
import { deleteAllSessions, deleteSession } from '../services/sessions.ts';
import { createUser, findUserRowByEmail, toUser } from '../services/users.ts';
import { HttpError } from '../utils/http.ts';
import { requireText, validateEmail, validateNickname, validatePassword } from '../utils/validate.ts';

export const authRouter = Router();

/** POST /api/auth/signup { email, password, nickname } — 가입 후 바로 로그인 상태가 된다 */
authRouter.post('/signup', signupLimiter, async (req, res) => {
  const email = validateEmail(req.body?.email);
  const password = validatePassword(req.body?.password);
  const nickname = validateNickname(req.body?.nickname);

  if (findUserRowByEmail(email)) throw new HttpError(409, '이미 가입된 이메일입니다.');
  const user = createUser(email, nickname, await hashPassword(password));

  startSession(res, user.id);
  res.status(201).json({ user });
});

/** POST /api/auth/login { email, password } */
authRouter.post('/login', loginLimiter, async (req, res) => {
  const email = requireText(req.body?.email, '이메일과 비밀번호를 입력하세요.').trim();
  const password = requireText(req.body?.password, '이메일과 비밀번호를 입력하세요.');

  const row = findUserRowByEmail(email);
  // 이메일이 없는 경우와 비밀번호가 틀린 경우를 구분하지 않는다 (가입 여부 노출 방지)
  if (!(await verifyPassword(password, row?.password_hash)) || !row) {
    throw new HttpError(401, '이메일 또는 비밀번호가 올바르지 않습니다.');
  }

  if (req.sessionToken) deleteSession(req.sessionToken);
  startSession(res, row.id);
  res.json({ user: toUser(row) });
});

/** POST /api/auth/logout */
authRouter.post('/logout', (req, res) => {
  if (req.sessionToken) deleteSession(req.sessionToken);
  clearSessionCookie(res);
  res.status(204).end();
});

/** POST /api/auth/logout-all — 이 기기를 포함해 모든 기기에서 로그아웃 */
authRouter.post('/logout-all', requireAuth, (req, res) => {
  deleteAllSessions(currentUser(req).id);
  clearSessionCookie(res);
  res.status(204).end();
});

/** GET /api/auth/me — 로그인 상태 확인. 로그인하지 않았으면 { user: null } */
authRouter.get('/me', (req, res) => {
  res.json({ user: req.user ?? null });
});
