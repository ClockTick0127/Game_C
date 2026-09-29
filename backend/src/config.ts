// PORT 대신 API_PORT를 쓰는 이유: 환경에 PORT가 전역으로 잡혀 있으면 프론트엔드 개발 서버와 포트가 겹친다.
export const API_PORT = Number(process.env.API_PORT) || 4000;
export const RAWG_API_KEY = process.env.RAWG_API_KEY?.trim() ?? '';
