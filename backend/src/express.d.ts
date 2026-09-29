import type { User } from './services/users.ts';

// loadUser 미들웨어가 채워 넣는 값
declare global {
  namespace Express {
    interface Request {
      /** requestLogger가 붙이는 요청 ID */
      id?: string;
      user?: User;
      sessionToken?: string;
    }
  }
}

export {};
