import { fileURLToPath } from 'node:url';

// PORT 대신 API_PORT를 쓰는 이유: 환경에 PORT가 전역으로 잡혀 있으면 프론트엔드 개발 서버와 포트가 겹친다.
export const API_PORT = Number(process.env.API_PORT) || 4000;
export const RAWG_API_KEY = process.env.RAWG_API_KEY?.trim() ?? '';
/** SQLite DB 파일 경로. 기본값은 backend/data/app.db */
export const DB_PATH = process.env.DB_PATH || fileURLToPath(new URL('../data/app.db', import.meta.url));
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
