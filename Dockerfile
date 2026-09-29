# ---- 1단계: 프론트엔드 빌드 ----
FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN npm ci
COPY frontend frontend
RUN npm run build

# ---- 2단계: 실행 이미지 (운영 의존성 + 빌드 결과만) ----
FROM node:26-slim
ENV NODE_ENV=production \
    API_PORT=4000 \
    DB_PATH=/data/app.db
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN npm ci --omit=dev -w backend --include-workspace-root=false && npm cache clean --force
# Node가 TypeScript를 직접 실행하므로 소스를 그대로 복사한다
COPY backend/src backend/src
COPY --from=build /app/frontend/dist frontend/dist

# SQLite DB(계정, 세션, 관심 게임)는 볼륨에 저장한다
RUN mkdir /data && chown node:node /data
VOLUME /data
USER node

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.API_PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "backend/src/index.ts"]
