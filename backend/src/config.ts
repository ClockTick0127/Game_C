import { fileURLToPath } from 'node:url';

// PORT 대신 API_PORT를 쓰는 이유: 환경에 PORT가 전역으로 잡혀 있으면 프론트엔드 개발 서버와 포트가 겹친다.
export const API_PORT = Number(process.env.API_PORT) || 4000;
export const RAWG_API_KEY = process.env.RAWG_API_KEY?.trim() ?? '';
/** SQLite DB 파일 경로. 기본값은 backend/data/app.db */
export const DB_PATH = process.env.DB_PATH || fileURLToPath(new URL('../data/app.db', import.meta.url));
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
/** 리버스 프록시 뒤에서 실행할 때 프록시 단계 수 (예: 1). 클라이언트 IP와 secure 쿠키 판단에 쓰인다. 기본값 0 = 프록시 없음 */
export const TRUST_PROXY = Number(process.env.TRUST_PROXY) || 0;
/** 빌드된 프론트엔드 경로. 이 폴더가 있으면 API 서버가 정적 파일도 함께 서빙한다 */
export const FRONTEND_DIST = process.env.FRONTEND_DIST || fileURLToPath(new URL('../../frontend/dist', import.meta.url));
