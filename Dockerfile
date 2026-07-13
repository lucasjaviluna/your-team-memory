# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/server/package.json ./packages/server/

RUN npm ci

COPY packages/server/tsconfig.json ./packages/server/
COPY packages/server/src ./packages/server/src

RUN npm run build --workspace=packages/server

# ── Production stage ───────────────────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/server/package.json ./packages/server/

RUN npm ci --omit=dev

COPY --from=builder /app/packages/server/dist ./packages/server/dist

# Usuario no root
RUN addgroup -S mcpuser && adduser -S mcpuser -G mcpuser
USER mcpuser

EXPOSE 3100

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:${MCP_PORT:-3100}/health || exit 1

CMD ["node", "packages/server/dist/index.js"]
