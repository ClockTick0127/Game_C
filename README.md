# 게임 캘린더

[RAWG API](https://rawg.io/apidocs)에서 게임 출시 정보를 가져와 월간 캘린더에 표시하는 웹사이트입니다.

## 기능

- 월간 캘린더 (이전 달 / 다음 달 / 오늘 이동)
- 날짜별 출시 게임 표시 (인기순, 한 칸에 최대 3개 + "더보기")
- 날짜 클릭 → 그날 출시되는 전체 게임 목록
- 게임 클릭 → 상세 정보 (플랫폼, 장르, 평점, 메타크리틱, RAWG 링크)
- 메타스코어(PC, Steam에 연결된 메타크리틱 점수) · Steam 사용자 평가(매우 긍정적 94% 등) · 스토어 바로가기 (Steam, Epic Games, GOG, PlayStation, Xbox, Nintendo 등)
- 게임 소개 · 개발사/유통사 · Steam 한국 가격 · 한국어 지원 여부 · 분류/태그 · 평균 플레이 시간 · 연령 등급(ESRB) · 스크린샷 · 공식 웹사이트 (RAWG + Steam 스토어, 가져오지 못한 항목은 숨김)
- PC 스토어별 가격 비교(CheapShark, USD) · 역대 최저가 · Steam 현재 접속자 수 · DLC/에디션과 같은 시리즈 게임 목록 (RAWG)
- iOS 게임: 한국 App Store 가격 · 별점 · 연령 등급 · 한국어 지원 · 용량 · 스크린샷 · 한국어 소개 (Apple iTunes API, 키 불필요. RAWG의 App Store 링크가 있으면 그 앱으로, 없으면 이름으로 찾습니다)
- 모바일 화면에서는 날짜별 게임 개수 뱃지로 표시
- API 키가 없으면 샘플 데이터로 동작
- 회원가입 · 로그인 · 로그아웃 (이메일 + 비밀번호)
- 관심 게임 추가/삭제 (게임 상세의 ☆ 버튼, 캘린더에 ★ 표시)
- 보기 방식: 월간 격자 · 주간(요일별 세로 목록, 두 달에 걸친 주 지원) · 목록(출시일 순). 선택은 브라우저에 저장되고, 저장된 값이 없으면 모바일은 목록으로 시작
- 검색·필터: 그 달의 게임을 제목으로 검색하고 플랫폼·장르·관심 게임만 골라 보기 (달을 넘겨도 유지)
- 라이트/다크 테마: 상단 버튼으로 시스템 설정 → 라이트 → 다크 전환 (선택은 브라우저에 저장)
- 캘린더 구독: 관심 게임 출시일을 구글·애플 캘린더 등에서 볼 수 있는 구독 주소(.ics) 제공 (마이페이지)
- 마이페이지: 프로필(닉네임 수정), 관심 게임 목록(출시 예정 D-day / 출시됨), 비밀번호 변경, 모든 기기에서 로그아웃, 회원 탈퇴

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
| GET | `/api/me/calendar-token` 🔒 | 캘린더 구독 주소용 토큰 (없으면 생성). `{ token }` |
| POST | `/api/me/calendar-token` 🔒 | 토큰 재발급 (기존 구독 주소 무효화). `{ token }` |
| GET | `/api/calendar/:token.ics` | 관심 게임 캘린더(iCalendar). 로그인 불필요, 토큰이 곧 열쇠 |

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
상태를 바꾸는 요청(POST/PUT/PATCH/DELETE)은 Origin 헤더가 서버 주소와 같아야 통과합니다(CSRF 방어). 화면을 다른 주소에서 서빙한다면 `ALLOWED_ORIGINS=https://app.example.com`을 설정하세요. 개발 모드에서는 Vite(5173) 출처가 기본 허용됩니다.

## 테스트

```bash
npm test                # 백엔드 + 프론트엔드 테스트를 모두 실행
npm test -w backend     # 백엔드 API 테스트 (임시 SQLite DB를 만들어 실제 HTTP로 검증)
npm test -w frontend    # 프론트엔드 테스트 (Vitest + Testing Library, jsdom)
```

## 코드 품질

```bash
npm run lint            # ESLint (TypeScript, React Hooks, 접근성 jsx-a11y)
npm run format:check    # Prettier 서식 검사 (npm run format 으로 자동 정리)
```

CI가 lint, 서식, 타입체크, 테스트, 빌드, 운영 의존성 취약점 검사(`npm audit`)를 실행합니다. 매주 월요일에도 자동으로 한 번 실행되고, Dependabot이 의존성·GitHub Actions·Docker 이미지 업데이트 PR을 올립니다. 줄바꿈은 LF로 통일합니다(`.gitattributes`, `.editorconfig`).

### 의존성 업데이트 (Dependabot)

매주 npm 의존성, GitHub Actions, Docker 베이스 이미지의 새 버전을 확인해 PR을 올립니다(`.github/dependabot.yml`). npm 마이너·패치 업데이트는 한 PR로 묶입니다. 병합하기 전에 아래를 확인하세요.

- **CI가 통과해야 합니다.** lint, 서식, 타입체크, 테스트, 빌드, 감사, Docker 빌드가 모두 성공해야 병합합니다.
- **메이저 버전 상승은 변경 내용을 읽어 봅니다.** CI가 통과해도 동작이 달라질 수 있습니다.
- **Node 메이저 버전(`node:24-slim` → 26 등)은 바로 병합하지 않습니다.** 배포 런타임이 바뀌므로 `node:sqlite`가 새 버전에서도 동작하는지 로컬에서 확인하고, Dockerfile, CI(`setup-node`), `package.json`의 `engines`, README의 Node 버전을 함께 올립니다.
- **ESLint와 `@eslint/js`는 9 버전대에 고정되어 있어 메이저 업데이트 PR이 오지 않습니다.** 접근성 검사(`eslint-plugin-jsx-a11y`)가 ESLint 10을 아직 지원하지 않아, 올리면 `npm ci`가 실패합니다. 지원되면 `dependabot.yml`의 무시 규칙을 지우고 함께 올립니다.
- 필요 없는 PR은 닫으면 됩니다. 같은 버전의 PR은 다시 열리지 않습니다.

## 로그

API 요청이 끝나면 `<요청 ID> <메서드> <경로> <상태 코드> <걸린 시간>ms [user=<번호>]` 한 줄을 남기고, 모든 응답에 `X-Request-Id` 헤더를 붙입니다. 서버 오류 로그에도 같은 ID가 들어가므로 사용자가 겪은 문제를 찾아갈 수 있습니다. 쿼리 문자열·본문·쿠키는 기록하지 않습니다. `LOG_REQUESTS=0`으로 끌 수 있습니다.

## Docker

```bash
docker build -t game-calendar .
docker run -d -p 4000:4000 -v game-calendar-data:/data -e RAWG_API_KEY=발급받은키 game-calendar
```

계정 · 관심 게임 데이터(SQLite)는 `/data` 볼륨에 저장되므로 볼륨을 지정해야 컨테이너를 다시 만들어도 유지됩니다.
프록시(nginx 등) 뒤에 둘 때는 `-e TRUST_PROXY=1`을 추가하세요. HTTPS 없이 접속하면 로그인 쿠키(`secure`)가 저장되지 않으므로, 운영에서는 HTTPS 프록시 뒤에서 사용하세요.

## CI

GitHub Actions(`.github/workflows/ci.yml`)가 push · PR마다 타입체크 → 테스트 → 빌드 → Docker 이미지 빌드 및 기동 확인을 실행합니다.
