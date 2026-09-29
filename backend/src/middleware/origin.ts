import type { RequestHandler } from 'express';
import { ALLOWED_ORIGINS } from '../config.ts';
import { HttpError } from '../utils/http.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * 상태를 바꾸는 요청(POST/PUT/PATCH/DELETE)의 Origin 헤더를 검사한다 (CSRF 이중 방어).
 * 브라우저는 다른 사이트에서 보낸 이런 요청에 항상 Origin을 붙이므로, 서버 주소(Host)나
 * ALLOWED_ORIGINS와 다르면 거부한다. Origin이 없는 요청(curl, 서버 간 호출)은 브라우저가 아니므로 통과시킨다.
 * 프록시 뒤에서는 TRUST_PROXY를 설정해야 req.host가 X-Forwarded-Host를 따른다.
 */
export const checkOrigin: RequestHandler = (req, _res, next) => {
  const origin = req.headers.origin;
  if (SAFE_METHODS.has(req.method) || origin === undefined) {
    next();
    return;
  }

  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    // "null" 등 해석할 수 없는 출처는 아래에서 거부된다
  }

  if (originHost === req.host || ALLOWED_ORIGINS.includes(origin)) {
    next();
    return;
  }
  throw new HttpError(403, '허용되지 않은 출처의 요청입니다.');
};
