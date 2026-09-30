import type { Request, RequestHandler, Response } from 'express';
import { IS_PRODUCTION } from '../config.ts';
import { createSession, findSessionUser } from '../services/sessions.ts';
import type { User } from '../services/users.ts';
import { HttpError } from '../utils/http.ts';

const SESSION_COOKIE = 'sid';

export function readCookie(req: Request, name: string): string | undefined {
  for (const part of req.headers.cookie?.split(';') ?? []) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/** 모든 요청에서 세션 쿠키를 확인해 req.user를 채운다. 로그인하지 않았으면 비워둔다. */
export const loadUser: RequestHandler = (req, _res, next) => {
  const token = readCookie(req, SESSION_COOKIE);
  const user = token ? findSessionUser(token) : null;
  if (token && user) {
    req.user = user;
    req.sessionToken = token;
  }
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) throw new HttpError(401, '로그인이 필요합니다.');
  next();
};

/** requireAuth 뒤에서만 사용 */
export function currentUser(req: Request): User {
  if (!req.user) throw new HttpError(401, '로그인이 필요합니다.');
  return req.user;
}

export function startSession(res: Response, userId: number): void {
  const { token, expiresAt } = createSession(userId);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, // JS에서 읽을 수 없게 해 XSS로 토큰이 탈취되는 것을 막는다
    sameSite: 'lax', // 다른 사이트에서 보낸 POST 요청에는 쿠키가 실리지 않는다 (CSRF 방어)
    secure: IS_PRODUCTION,
    path: '/',
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: IS_PRODUCTION, path: '/' });
}
