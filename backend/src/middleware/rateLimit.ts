import { rateLimit } from 'express-rate-limit';

/** 테스트에서 다른 검증에 영향을 주지 않도록 요청 제한을 끌 수 있다 (운영에서는 설정하지 않는다) */
const DISABLED = process.env.RATE_LIMIT_DISABLED === '1';

function limiter(windowMs: number, limit: number, message: string, skipSuccessfulRequests = false) {
  return rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests,
    skip: () => DISABLED,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: message });
    },
  });
}

const MINUTE = 60 * 1000;

/** API 전체: 과도한 요청 방지 */
export const apiLimiter = limiter(MINUTE, 300, '요청이 너무 많습니다. 잠시 후 다시 시도하세요.');

/** 게임 조회: 조회 한 번이 RAWG·Steam 호출 여러 건으로 이어질 수 있어 일반 API보다 낮게 잡는다 */
export const gamesLimiter = limiter(MINUTE, 60, '게임 정보를 너무 자주 요청했습니다. 잠시 후 다시 시도하세요.');

/** 로그인: 비밀번호 무차별 대입 방지 (성공한 요청은 횟수에 포함하지 않는다) */
export const loginLimiter = limiter(15 * MINUTE, 10, '로그인 시도가 너무 많습니다. 15분 후 다시 시도하세요.', true);

/** 회원가입: 계정 대량 생성 방지 */
export const signupLimiter = limiter(60 * MINUTE, 10, '가입 시도가 너무 많습니다. 잠시 후 다시 시도하세요.');

/** 비밀번호 확인이 필요한 작업(비밀번호 변경, 탈퇴): 로그인된 세션에서의 추측 방지 */
export const sensitiveLimiter = limiter(15 * MINUTE, 10, '시도가 너무 많습니다. 15분 후 다시 시도하세요.');
