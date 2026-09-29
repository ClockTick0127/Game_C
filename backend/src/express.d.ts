import type { User } from './services/users.ts';

// loadUser 미들웨어가 채워 넣는 값
declare global {
  namespace Express {
    interface Request {
      user?: User;
      sessionToken?: string;
    }
  }
}

export {};
