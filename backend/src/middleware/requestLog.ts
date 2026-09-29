import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { LOG_REQUESTS } from '../config.ts';

/** 프록시(nginx 등)가 이미 붙여 온 요청 ID를 이어받을 수 있게 하되, 로그를 오염시킬 수 있는 값은 거른다 */
const ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

/** 로그를 남기지 않을 경로. Docker 상태 확인(HEALTHCHECK)이 30초마다 호출해 로그를 덮어 버린다. */
const QUIET_PATHS = new Set(['/api/health']);

/**
 * 모든 요청에 ID를 붙이고(X-Request-Id 응답 헤더), API 요청이 끝나면 한 줄로 기록한다.
 *   <요청 ID> <메서드> <경로> <상태 코드> <걸린 시간>ms [user=<사용자 번호>]
 * 오류 로그에도 같은 ID가 들어가서, 사용자가 겪은 문제를 서버 로그에서 찾아갈 수 있다.
 *
 * 쿼리 문자열, 요청 본문, 쿠키는 개인정보나 비밀번호가 섞일 수 있어 기록하지 않는다.
 * 정적 파일(화면 자원) 요청은 양이 많아 API 요청만 기록한다.
 */
export const requestLogger: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  req.id = incoming && ID_PATTERN.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);

  // 캘린더 구독 주소의 토큰은 비밀번호와 같으므로 로그에 남기지 않는다
  const path = req.originalUrl.split('?')[0]!.replace(/^(\/api\/calendar\/)[^/]+/, '$1:token');
  if (LOG_REQUESTS && path.startsWith('/api/') && !QUIET_PATHS.has(path)) {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);
      const user = req.user ? ` user=${req.user.id}` : '';
      console.log(`${req.id} ${req.method} ${path} ${res.statusCode} ${ms}ms${user}`);
    });
  }
  next();
};
