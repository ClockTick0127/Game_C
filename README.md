# 게임 캘린더

[RAWG API](https://rawg.io/apidocs)에서 게임 출시 정보를 가져와 월간 캘린더에 표시하는 웹사이트입니다.

## 기능

- 월간 캘린더 (이전 달 / 다음 달 / 오늘 이동)
- 날짜별 출시 게임 표시 (인기순, 한 칸에 최대 3개 + "더보기")
- 날짜 클릭 → 그날 출시되는 전체 게임 목록
- 게임 클릭 → 상세 정보 (플랫폼, 장르, 평점, 메타크리틱, RAWG 링크)
- 메타스코어(PC, Steam에 연결된 메타크리틱 점수) · Steam 사용자 평가(매우 긍정적 94% 등) · 스토어 바로가기 (Steam, Epic Games, GOG, PlayStation, Xbox, Nintendo 등)
- 모바일 화면에서는 날짜별 게임 개수 뱃지로 표시
- API 키가 없으면 샘플 데이터로 동작
- 회원가입 · 로그인 · 로그아웃 (이메일 + 비밀번호)
- 관심 게임 추가/삭제 (게임 상세의 ☆ 버튼, 캘린더에 ★ 표시)
- 마이페이지: 프로필(닉네임 수정), 관심 게임 목록(출시 예정 D-day / 출시됨), 비밀번호 변경, 회원 탈퇴

## 시작하기

Node.js 24 이상이 필요합니다. (백엔드는 Node가 TypeScript를 직접 실행하고, 내장 SQLite를 사용합니다)

```bash
npm install                             # frontend, backend 의존성을 한 번에 설치
cp backend/.env.example backend/.env    # RAWG_API_KEY 에 발급받은 키 입력
npm run dev                             # 백엔드(4000) + 프론트엔드(5173) 동시 실행
```

브라우저에서 http://localhost:5173 을 엽니다.
API 키는 [rawg.io/apidocs](https://rawg.io/apidocs)에서 무료로 발급받을 수 있습니다.
`backend/.env`를 수정한 뒤에는 서버를 다시 시작해야 합니다.

계정 · 관심 게임 데이터는 `backend/data/app.db`(SQLite, git에 포함되지 않음)에 저장됩니다. 파일을 지우면 초기화됩니다.

## 구조

```
frontend/                         React + Vite + React Router
  vite.config.ts                  /api 요청을 백엔드(localhost:4000)로 프록시
  src/
    App.tsx                       라우팅 (/, /login, /signup, /mypage)
    api/                          백엔드 API 호출 (client.ts: 공통 요청·에러 처리)
    contexts/AuthContext.tsx      로그인 상태
    contexts/FavoritesContext.tsx 관심 게임 목록
    pages/                        캘린더 · 로그인 · 회원가입 · 마이페이지
    components/                   캘린더 · 모달 · 상단 바 UI
    hooks/useMonthlyReleases.ts   월별 출시 게임 조회 (캐시, 요청 취소)

backend/                          Node.js + Express + SQLite(node:sqlite)
  .env.example                    RAWG_API_KEY, API_PORT
  src/
    index.ts                      서버 진입점, 라우터 연결, 에러 처리
    db.ts                         DB 연결 및 테이블 생성 (users, sessions, favorites)
    middleware/auth.ts            세션 쿠키 → req.user, 로그인 필수 처리
    routes/                       games · auth · me(마이페이지) API
    services/                     RAWG 호출, 사용자 · 세션 · 관심 게임 DB 처리, 비밀번호 해시
    utils/validate.ts             입력값 검증
```

`Game` 타입은 `frontend/src/types.ts`와 `backend/src/types.ts`에 같은 모양으로 정의되어 있으니, 바꿀 때는 둘 다 수정하세요.

## API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/games?start=YYYY-MM-DD&end=YYYY-MM-DD` | 기간(최대 62일) 내 출시 게임 목록. `{ games, sample }` |
| GET | `/api/games/:id/store-info` | 스토어 바로가기 링크, Steam 사용자 평가, 메타스코어(PC). `{ stores, steam, metacritic }` (6시간 캐시) |
| GET | `/api/health` | 서버 상태. `{ ok, sample }` |
| POST | `/api/auth/signup` | 회원가입 후 로그인. `{ email, password, nickname }` → `{ user }` |
| POST | `/api/auth/login` | 로그인. `{ email, password }` → `{ user }` |
| POST | `/api/auth/logout` | 로그아웃 |
| GET | `/api/auth/me` | 현재 로그인 사용자. 로그인 전이면 `{ user: null }` |
| PATCH | `/api/me` 🔒 | 닉네임 변경. `{ nickname }` → `{ user }` |
| PUT | `/api/me/password` 🔒 | 비밀번호 변경 (다른 기기 로그아웃). `{ currentPassword, newPassword }` |
| DELETE | `/api/me` 🔒 | 회원 탈퇴. `{ password }` |
| GET | `/api/me/favorites` 🔒 | 관심 게임 목록 (출시일 순). `{ games }` |
| PUT | `/api/me/favorites/:gameId` 🔒 | 관심 게임 추가 (본문: Game) |
| DELETE | `/api/me/favorites/:gameId` 🔒 | 관심 게임 삭제 |

🔒 로그인 필요 (없으면 401). 실패 시 `{ error: "사유" }`와 함께 400 / 401 / 409(이메일 중복) / 502·504(RAWG 오류) 등을 반환합니다.

## 보안 메모

- RAWG API 키는 백엔드에만 있고 브라우저로는 전달되지 않습니다.
- 비밀번호는 scrypt(솔트 포함)로 해시해 저장합니다.
- 로그인은 서버 세션 방식입니다. 세션 토큰은 `httpOnly`·`SameSite=Lax` 쿠키에 담기고(7일), DB에는 토큰의 해시만 저장됩니다.
  배포 시 `NODE_ENV=production`으로 실행하면 쿠키에 `Secure`가 붙습니다(HTTPS 필요).
- 아직 없는 것: 로그인 시도 횟수 제한(무차별 대입 방지), 이메일 인증, 비밀번호 찾기.

## 프로덕션 실행

```bash
npm run build                                   # frontend/dist 생성
NODE_ENV=production npm start -w backend        # Windows PowerShell: $env:NODE_ENV="production"; npm start -w backend
```

`frontend/dist`가 있으면 백엔드(기본 4000 포트)가 화면과 API를 함께 서빙합니다.
nginx 등 리버스 프록시 뒤에서 실행한다면 `TRUST_PROXY=1`을 설정해야 클라이언트 IP(요청 제한)가 올바르게 잡힙니다.
요청 제한: 로그인 15분당 10회(실패 기준), 가입 1시간당 10회, 비밀번호 변경·탈퇴 15분당 10회, API 전체 분당 300회.
