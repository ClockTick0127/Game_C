# 게임 캘린더

[RAWG API](https://rawg.io/apidocs)에서 게임 출시 정보를 가져와 월간 캘린더에 표시하는 웹사이트입니다.

## 기능

- 월간 캘린더 (이전 달 / 다음 달 / 오늘 이동)
- 날짜별 출시 게임 표시 (인기순, 한 칸에 최대 3개 + "더보기")
- 날짜 클릭 → 그날 출시되는 전체 게임 목록
- 게임 클릭 → 상세 정보 (플랫폼, 장르, 평점, 메타크리틱, RAWG 링크)
- 모바일 화면에서는 날짜별 게임 개수 뱃지로 표시
- API 키가 없으면 샘플 데이터로 동작

## 시작하기

Node.js 24 이상이 필요합니다. (백엔드는 Node가 TypeScript를 직접 실행합니다)

```bash
npm install                             # frontend, backend 의존성을 한 번에 설치
cp backend/.env.example backend/.env    # RAWG_API_KEY 에 발급받은 키 입력
npm run dev                             # 백엔드(4000) + 프론트엔드(5173) 동시 실행
```

브라우저에서 http://localhost:5173 을 엽니다.
API 키는 [rawg.io/apidocs](https://rawg.io/apidocs)에서 무료로 발급받을 수 있습니다.
`backend/.env`를 수정한 뒤에는 서버를 다시 시작해야 합니다.

## 구조

```
frontend/                         React + Vite
  vite.config.ts                  /api 요청을 백엔드(localhost:4000)로 프록시
  src/
    api/games.ts                  백엔드 API 호출
    hooks/useMonthlyReleases.ts   월별 출시 게임 조회 (캐시, 요청 취소)
    utils/calendar.ts             캘린더 날짜 계산
    components/                   캘린더 · 모달 UI

backend/                          Node.js + Express
  .env.example                    RAWG_API_KEY, API_PORT
  src/
    index.ts                      서버 진입점, 에러 처리
    routes/games.ts               GET /api/games (요청 검증)
    services/releases.ts          샘플/실제 데이터 선택, 결과 캐시
    services/rawg.ts              RAWG API 호출 및 응답 정규화
    services/sampleData.ts        API 키가 없을 때 쓰는 샘플 데이터
```

`Game` 타입은 `frontend/src/types.ts`와 `backend/src/types.ts`에 같은 모양으로 정의되어 있으니, 바꿀 때는 둘 다 수정하세요.

## API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/games?start=YYYY-MM-DD&end=YYYY-MM-DD` | 기간(최대 62일) 내 출시 게임 목록. `{ games, sample }` |
| GET | `/api/health` | 서버 상태. `{ ok, sample }` |

실패 시 `{ error: "사유" }`와 함께 400(잘못된 요청) / 502·504(RAWG 오류·시간 초과) 등을 반환합니다.

RAWG API 키는 백엔드에만 있고 브라우저로는 전달되지 않습니다.
