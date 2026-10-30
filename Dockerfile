# Hormigas — one container serves the API, WebSockets and the built client.
# Works on any host that runs Docker images (Railway, Render, Fly.io, a VPS…).

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
# Only what the client build reads, so changes to docs, art sources or server code
# don't force a fresh client build (the build cache reuses this step).
COPY tsconfig.base.json ./
COPY docs/data docs/data
COPY shared shared
COPY client client
RUN npm run build -w client

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
# runtime deps only (the server runs TypeScript directly with tsx)
RUN npm ci --omit=dev --workspace server --include-workspace-root=false && npm cache clean --force
COPY docs/data docs/data
COPY shared shared
COPY server/src server/src
COPY server/tsconfig.json server/
COPY tsconfig.base.json ./
COPY --from=build /app/client/dist client/dist

WORKDIR /app/server
EXPOSE 3000
USER node
CMD ["node", "--import", "tsx", "src/index.ts"]
