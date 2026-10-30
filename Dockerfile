# syntax=docker/dockerfile:1

# ---- base: Node 24 LTS + pnpm pinned through corepack (package.json "packageManager") ----
FROM node:24-bookworm-slim AS base
ENV COREPACK_HOME=/opt/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# openssl is needed by the Prisma CLI's engine detection (migrations from I02 on).
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable
WORKDIR /app

# ---- build: install with the frozen lockfile and build every workspace package ----
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack install && chmod -R a+rX /opt/corepack
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/widget/package.json packages/widget/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ---- runtime ----
# Known limitation: the image keeps dev dependencies so `pnpm toolchain:check` and
# Prisma migrations (run on container start) work in the same image. Slimming is deferred.
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /opt/corepack /opt/corepack
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
# Apply pending migrations, then start. `&&` means a failed migration stops the container
# (fail fast); `exec` makes node PID 1 of the shell so it receives SIGTERM.
CMD ["sh", "-c", "cd apps/api && pnpm exec prisma migrate deploy && cd ../.. && exec node apps/api/dist/server.js"]
