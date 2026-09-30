import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { IS_PRODUCTION, PUBLIC_URL } from '../config.ts';
import { clearSessionCookie, currentUser, readCookie, requireAuth, startSession } from '../middleware/auth.ts';
import { loginLimiter, signupLimiter, steamAuthLimiter } from '../middleware/rateLimit.ts';
import { hashPassword, verifyPassword } from '../services/password.ts';
import { deleteAllSessions, deleteSession } from '../services/sessions.ts';
import { buildAuthUrl, verifyAssertion } from '../services/steamOpenId.ts';
import { createUser, findUserRowByEmail, findUserRowBySteamId, setSteamId, toUser } from '../services/users.ts';
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

// --- Steam 로그인 (OpenID 2.0) ---
// 흐름: /steam → Steam 로그인 페이지 → /steam/callback. 비밀번호는 Steam 페이지에서만 입력하고 우리는 SteamID만 받는다.

const STEAM_COOKIE = 'steam_oid';
const STEAM_COOKIE_PATH = '/api/auth/steam';
const STEAM_FLOW_TTL_MS = 10 * 60 * 1000;

interface SteamFlow {
  state: string;
  mode: 'login' | 'link';
  redirect: string;
}

/** 로그인 후 돌아갈 내부 경로만 허용한다 (오픈 리다이렉트 방지) */
function safeRedirect(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return '/';
  }
  return value;
}

function steamCookieOptions() {
  return { httpOnly: true, sameSite: 'lax' as const, secure: IS_PRODUCTION, path: STEAM_COOKIE_PATH };
}

/** Steam이 돌려보낼 우리 콜백 주소. state는 이 요청을 시작한 브라우저에만 있는 쿠키와 대조한다 */
function steamReturnTo(req: Request, state: string): string {
  const base = PUBLIC_URL || `${req.protocol}://${req.host}`;
  return `${base}/api/auth/steam/callback?state=${state}`;
}

function readSteamFlow(req: Request): SteamFlow | null {
  try {
    const raw = readCookie(req, STEAM_COOKIE);
    const flow = raw ? (JSON.parse(Buffer.from(raw, 'base64url').toString()) as Partial<SteamFlow>) : null;
    if (typeof flow?.state !== 'string' || (flow.mode !== 'login' && flow.mode !== 'link')) return null;
    return { state: flow.state, mode: flow.mode, redirect: safeRedirect(flow.redirect) };
  } catch {
    return null;
  }
}

function sameText(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * GET /api/auth/steam?mode=login|link&redirect=/경로 — Steam 로그인 페이지로 보낸다.
 * link는 이미 로그인한 사용자가 자기 계정에 Steam을 연결할 때 쓴다.
 */
authRouter.get('/steam', steamAuthLimiter, (req, res) => {
  const mode = req.query.mode === 'link' ? 'link' : 'login';
  if (mode === 'link' && !req.user) {
    res.redirect('/login?redirect=%2Fmypage');
    return;
  }

  const flow: SteamFlow = { state: randomBytes(16).toString('hex'), mode, redirect: safeRedirect(req.query.redirect) };
  res.cookie(STEAM_COOKIE, Buffer.from(JSON.stringify(flow)).toString('base64url'), {
    ...steamCookieOptions(),
    maxAge: STEAM_FLOW_TTL_MS,
  });
  res.redirect(buildAuthUrl(steamReturnTo(req, flow.state)));
});

function steamFail(res: Response, mode: SteamFlow['mode'], code: string): void {
  res.redirect(`${mode === 'link' ? '/mypage' : '/login'}?steam=${code}`);
}

/** GET /api/auth/steam/callback — Steam이 로그인을 마치고 돌아오는 곳. 결과는 화면 주소의 ?steam= 코드로 알린다 */
authRouter.get('/steam/callback', steamAuthLimiter, async (req, res) => {
  const flow = readSteamFlow(req);
  // 한 번 쓴 쿠키는 결과와 상관없이 지운다 (같은 응답으로 다시 들어오는 것을 막는다)
  res.clearCookie(STEAM_COOKIE, steamCookieOptions());

  const state = typeof req.query.state === 'string' ? req.query.state : '';
  // 내가 시작한 요청이 아니면 거부한다. 공격자가 자기 Steam 계정의 응답 주소를 피해자에게 열게 해서
  // 피해자 계정에 공격자의 Steam을 연결하는 것(로그인 CSRF)을 막는 핵심 검사다.
  if (!flow || !sameText(flow.state, state)) {
    steamFail(res, flow?.mode ?? 'login', 'failed');
    return;
  }

  let steamId: string;
  try {
    steamId = await verifyAssertion(
      new URL(req.originalUrl, 'http://localhost').searchParams,
      steamReturnTo(req, state),
    );
  } catch (err) {
    if (!(err instanceof HttpError)) throw err;
    console.warn(`Steam 로그인 검증 실패: ${err.detail ?? err.message} (요청 ${req.id})`);
    steamFail(res, flow.mode, 'failed');
    return;
  }

  if (flow.mode === 'link') {
    if (!req.user) {
      steamFail(res, 'login', 'failed');
      return;
    }
    const owner = findUserRowBySteamId(steamId);
    if (owner && owner.id !== req.user.id) {
      steamFail(res, 'link', 'taken');
      return;
    }
    setSteamId(req.user.id, steamId);
    res.redirect('/mypage?steam=linked');
    return;
  }

  const row = findUserRowBySteamId(steamId);
  if (!row) {
    steamFail(res, 'login', 'unlinked');
    return;
  }
  if (req.sessionToken) deleteSession(req.sessionToken);
  startSession(res, row.id);
  res.redirect(flow.redirect);
});
