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
export const FRONTEND_DIST =
  process.env.FRONTEND_DIST || fileURLToPath(new URL('../../frontend/dist', import.meta.url));
/** 개발 중에는 Vite 프록시가 Host를 백엔드 주소로 바꿔 보내므로, 프론트엔드 개발 서버 출처를 기본으로 허용한다 */
const DEV_ORIGINS = IS_PRODUCTION ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173'];
/** 같은 주소가 아니어도 API를 호출할 수 있는 출처 (ALLOWED_ORIGINS에 쉼표로 구분, 예: https://app.example.com) */
export const ALLOWED_ORIGINS = [
  ...DEV_ORIGINS,
  ...(process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean),
];
/** 서버 전체가 RAWG로 보낼 수 있는 분당 요청 수. IP가 여러 개여도 무료 요금제 한도를 지키기 위한 상한 */
export const RAWG_MAX_CALLS_PER_MINUTE = Number(process.env.RAWG_MAX_CALLS_PER_MINUTE) || 120;
/** 서버 전체가 Apple iTunes API로 보낼 수 있는 분당 요청 수. Apple이 IP당 분당 20회 안팎을 넘으면 거절하므로 그보다 낮게 둔다 */
export const ITUNES_MAX_CALLS_PER_MINUTE = Number(process.env.ITUNES_MAX_CALLS_PER_MINUTE) || 15;
/** 요청 로그 사용 여부. 기본은 켜짐이며 LOG_REQUESTS=0으로 끈다 */
export const LOG_REQUESTS = process.env.LOG_REQUESTS !== '0';
