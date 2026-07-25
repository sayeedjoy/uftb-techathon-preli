# syntax=docker/dockerfile:1
#
# Multi-stage build for the SCS-RG backend.
# Build context is the repository root, because the backend depends on the
# workspace package @scsrg/shared.

# ---------- build ----------
FROM node:24-alpine AS build
WORKDIR /repo

RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/

RUN pnpm install --frozen-lockfile=false --filter @scsrg/shared --filter backend

COPY packages/shared packages/shared
COPY backend backend

RUN pnpm --filter @scsrg/shared build \
 && pnpm --filter backend exec prisma generate \
 && pnpm --filter backend build

# Drop dev dependencies from the tree we are about to copy forward.
RUN pnpm --filter backend --prod deploy /app --legacy

# ---------- runtime ----------
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000

# Never run as root.
RUN addgroup -S scsrg && adduser -S scsrg -G scsrg

COPY --from=build --chown=scsrg:scsrg /app ./
COPY --from=build --chown=scsrg:scsrg /repo/backend/dist ./dist
COPY --from=build --chown=scsrg:scsrg /repo/backend/prisma ./prisma

USER scsrg
EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrations are applied on start so a fresh container converges on the schema.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
