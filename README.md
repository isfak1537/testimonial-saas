# Testimonial SaaS

> "Testimonial SaaS" is a temporary working name, defined once in
> `packages/shared/src/brand.ts`.

A multi-tenant app for collecting customer testimonials, reviewing them before they go
public, and publishing approved ones on a public Wall and embeddable widgets. It is built
incrementally as a student project; this branch contains **increment I00** (foundation and
marketing landing page) only. Sign-up, the dashboard, collection forms, Walls and widgets
are placeholders until their increments land.

## Stack

Modular monolith: React + TypeScript + Vite (web), Node.js 24 + Express 5 (API),
PostgreSQL 16 + Prisma 7, Docker Compose, pnpm workspaces.

```
apps/api          Express API; also serves the built web app and /embed/*
apps/web          React SPA: / (landing), /login, /signup, /app/**, /c/:slug, /w/:slug
packages/shared   Code shared by web and API (product name now; contracts later)
packages/widget   Embeddable widget: vanilla TypeScript + Shadow DOM, built to widget.v1.js
e2e               Playwright end-to-end tests
```

## Prerequisites

- Node.js 24 (`node --version`)
- pnpm 12.16.1 through corepack. The version is pinned in `package.json` (`packageManager`).
  If `/usr/local/bin` is not writable, install the shim in a user directory:
  ```sh
  mkdir -p ~/.local/bin
  corepack enable --install-directory ~/.local/bin pnpm
  # and add ~/.local/bin to PATH
  ```
- Docker with Compose v2+

## Getting started

```sh
pnpm install
docker compose up -d --build --wait   # db + api on http://localhost:3000
```

No `.env` is required: every setting has a local development default. To override values,
copy `.env.example` to `.env`. Host ports are bound to `127.0.0.1`. The database ports
default to 54320 (dev) and 54330 (test) so they do not clash with a local Postgres on 5432.

For frontend development with hot reload, run `pnpm -F @testimonial-saas/web dev`
(Vite serves http://localhost:5173 and proxies `/api` and `/embed` to the API on port 3000).
The API checks the `Origin` header on writes, so start it with `APP_ORIGIN=http://localhost:5173`
when you use the Vite dev server (set it in `.env`, then `docker compose up -d --build --wait`).

## Commands

| Command                                            | What it does                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm verify`                                      | Lint, format check, build, typecheck, unit tests, widget size                       |
| `pnpm test:api -- <pattern>`                       | API tests (Vitest + Supertest)                                                      |
| `pnpm test:e2e -- <spec>`                          | Playwright tests against http://localhost:3000                                      |
| `pnpm db:test:up`                                  | Start the throwaway test database (tmpfs)                                           |
| `pnpm size`                                        | Fail if the widget bundle exceeds 30 KB gzipped                                     |
| `docker compose run --rm api pnpm toolchain:check` | Check Node, pnpm, argon2id, Zod, Pino, rate limiter and Prisma inside the API image |

The first Playwright run needs a browser: `pnpm exec playwright install chromium`.

## Known limitations (I00)

- Only the landing page is real. Auth, dashboard, collection form and Wall routes show
  placeholder pages; the widget mounts an empty Shadow DOM root.
- The API has a health endpoint only. The standard error envelope, request IDs and request
  logging arrive in I01; the database schema arrives in I02.
- The API image keeps dev dependencies so the toolchain check and future migrations can run
  in it. Slimming the image is deferred.
- The public pages are a single-page app: content appears after JavaScript loads, and the
  pages are not server-rendered for SEO.

## Project documents

- `docs/requirements/PRD.md` and `SRS.md`: product and software requirements (v2).
- `docs/architecture/ARCHITECTURE.md`: where code goes and which rules it follows.
- `docs/BUILD_ORDER.md`: the increment plan (I00–I10).
- `CLAUDE.md`: instructions for Claude Code sessions.

The old Word drafts (`docs/requirements/*.docx`) are superseded, ignored by Git, and must not
be added.
