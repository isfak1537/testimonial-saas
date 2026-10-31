# Architecture Guideline — Testimonial SaaS

| Field      | Value                    |
| ---------- | ------------------------ |
| Version    | 1.0                      |
| Date       | 30 October 2026          |
| Applies to | All code from I01 onward |

This document says **where code goes and which rules it follows**. The SRS says _what_
the system does; this says _how_ we build it so that the parts stay simple and safe.

## 1. Big picture

```
            Browser (owner)                 Browser (customer)        Any website
                 │                                 │                        │
        React SPA: /app/**               React SPA: /c/:slug, /w/:slug   widget.v1.js
                 │  cookie sid                      │                        │  no cookie
                 ▼                                  ▼                        ▼
  ┌──────────────────────────── Express API (one Node process) ─────────────────────────┐
  │  /api/v1/auth/*         /api/v1/workspaces/:id/*      /api/v1/public/*     /embed/*   │
  │        │                         │                          │              static     │
  │   middleware: requestId → logger → securityHeaders → json(16kb) → origin check       │
  │        │                 requireSession → requireMember(roles)                        │
  │        ▼                         ▼                          ▼                         │
  │   modules/auth           modules/spaces, testimonials    modules/public               │
  │   routes → service → repo  (repos always take workspaceId)  (allowlist mappers)       │
  └───────────────────────────────────┬──────────────────────────────────────────────────┘
                                      ▼
                              PostgreSQL 16 (Prisma 7)
```

- **Modular monolith**: one deployable API that also serves the built SPA and the widget.
  Modules are folders with clear boundaries, not separate services.
- **Same origin** for dashboard and API, so cookies are first-party and CORS is only needed
  for the public Wall endpoint used by the widget.

## 2. Repository layout (target after I10)

```
apps/api/src/
  app.ts                 createApp({ config, prisma }) — wires middleware and routers
  server.ts              process start/stop only
  config.ts              Zod-validated env (add APP_ORIGIN, SESSION_* here)
  logger.ts              pino + redaction list
  http/
    errors.ts            AppError class + error codes from SRS §5.1
    error-handler.ts     converts any error into the envelope; logs with requestId
    request-id.ts
    request-logger.ts    one log line per request; never headers, bodies or query strings
    security-headers.ts
    json-body.ts         16 KB JSON body parser; rejects non-JSON content types
    origin-check.ts      SEC-02
    validate.ts          validate({ body, params, query }) with Zod schemas
    rate-limits.ts       named limiters (auth, submission, wall)
    health.ts            GET /health (per-app 1 s cached DB ping)
    auth-context.ts      requireSession, getSession(res) (I03); requireMember(roles), getCtx(res) (I04)
  db/
    client.ts            PrismaClient with adapter-pg
    types.ts             Db = PrismaClient | Prisma.TransactionClient
  modules/
    auth/                auth.routes.ts, auth.service.ts, auth.mappers.ts, users.repo.ts, sessions.repo.ts, password.ts, session-token.ts, cookie.ts
    workspaces/          members.repo.ts
    spaces/              spaces.routes.ts, spaces.service.ts, spaces.repo.ts, slug.ts
    testimonials/        testimonials.routes.ts, testimonials.service.ts, testimonials.repo.ts, transitions.ts
    public/              public.routes.ts, public.service.ts, public.mappers.ts
    audit/               audit.repo.ts
  scripts/
    purge.ts             counts + deletes (testimonials deleted > 30 days ago, expired sessions)
    purge-deleted.ts     CLI: dry-run by default, --confirm to delete (FR-OPS-01)
apps/api/test/
  helpers/               test-db.ts (migrate + truncate), factories.ts, test-config.ts, auth-app.ts (app + captured logs, signup/cookie helpers)
  unit/                  no database
  integration/           real db-test Postgres

apps/web/src/
  api/                   client.ts (fetch wrapper → ApiError), auth.ts, spaces.ts, testimonials.ts, public.ts
  auth/                  AuthProvider.tsx (calls /auth/me), RequireAuth.tsx
  components/            shared UI pieces (Button, Field, StatusBadge, EmptyState, CopyButton)
  surfaces/
    landing/  auth/  not-found/        (exist)
    app/                 SpacesListPage, NewSpacePage, SpaceLayout (tabs), InboxTab, CollectionTab, WallTab, EmbedTab, SettingsTab
    collect/             CollectSurface (public form)
    wall/                WallSurface (public Wall)

packages/shared/src/
  brand.ts               product name (exists)
  consent.ts             CONSENT_VERSION, consentText(spaceName), pinned hashes
  contracts/             Zod schemas + inferred types: auth.ts, spaces.ts, testimonials.ts, public.ts, errors.ts

packages/widget/src/
  index.ts               finds containers, mounts once each
  options.ts             data-attribute parsing (theme, limit, slug)
  api.ts                 fetch Wall JSON from the script's origin
  render.ts              DOM building with textContent only
  styles.ts              CSS string for the Shadow root (light/dark)
```

## 3. Backend rules

### 3.1 Layers (one direction only)

```
routes  →  service  →  repo  →  Prisma
```

| Layer   | Does                                                                                                  | Must not                                                                  |
| ------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| routes  | Validate input with shared Zod schemas, read `ctx`, call one service function, map result to response | Touch Prisma; contain business rules                                      |
| service | Business rules, state transitions, transactions, audit logging                                        | Read `req`/`res`; know about HTTP status codes (throw `AppError` instead) |
| repo    | All Prisma calls for its module                                                                       | Contain rules; ever query tenant data without `workspaceId`               |

A module may call another module's **service**, never its repo.

### 3.2 Tenant isolation pattern (the most important rule)

1. `requireSession` loads the session by token hash and puts `userId` in context.
2. `requireMember(["OWNER"])` reads `:workspaceId` from the URL, loads the membership for
   (workspaceId, userId), returns **404** if missing, **403** if role not allowed, and stores
   `ctx = { userId, workspaceId, role }`.
3. Every repo function for tenant data has this shape:

```ts
// The workspaceId argument is required, comes from ctx, and is always in the where clause.
export function findTestimonial(db: Db, workspaceId: string, spaceId: string, id: string) {
  return db.testimonial.findFirst({
    where: { id, spaceId, workspaceId, deletedAt: null },
  });
}
```

4. A missing row returns `null` → service throws `AppError.notFound()` → client sees 404.
   The client cannot tell "does not exist" from "belongs to someone else".
5. The database backs this up: the composite foreign key (`spaceId`, `workspaceId`) on
   Testimonial makes a mismatched row impossible.
6. Every increment that adds a tenant endpoint adds a **cross-tenant test**: user B calls
   the endpoint with user A's IDs and must get 404, and A's data must be unchanged.

### 3.3 Transactions

Any operation that changes status **and** writes an audit row runs inside
`prisma.$transaction(async (tx) => ...)`. Repos accept `db: Db` so the same function works
inside or outside a transaction.

### 3.4 Errors

- Throw `AppError` with an SRS code from services. Never `res.status(...)` in services.
- The error handler maps `ZodError` → 422, known Prisma unique violations → 409 with the
  right code, everything else → 500 `INTERNAL` with a generic message.
- Never put stack traces, SQL or internal IDs of other tenants in responses.

### 3.5 Public data

Public endpoints never return Prisma objects. They return the output of a mapper:

```ts
export function toPublicTestimonial(t: Testimonial): PublicTestimonial {
  return {
    id: t.id,
    authorName: t.authorName,
    authorTitle: t.authorTitle,
    rating: t.rating,
    content: t.content,
    publishedAt: t.publishedAt!.toISOString(),
  };
}
```

The "is public" filter lives in exactly one repo function (`listPublicTestimonials`) and
is covered by tests for each excluded case (pending, rejected, unpublished, withdrawn,
deleted, archived Space).

## 4. Frontend rules

- Routes already exist in `App.tsx`; keep `SPA_ROUTES` in `apps/api/src/app.ts` in sync
  (and fix the stale comment that mentions `router.tsx`).
- All HTTP goes through `api/client.ts`: `credentials: "same-origin"`, JSON headers,
  converts the error envelope into `ApiError { code, message, details, requestId }`.
- Types come from `@testimonial-saas/shared` contracts. No hand-written duplicate types.
- No global state library. `AuthProvider` holds the current user; pages hold their own data.
  Adding a library (e.g. TanStack Query) needs owner approval.
- Never use `dangerouslySetInnerHTML`.
- Forms: native inputs with `<label>`, show field errors from `details[]`, disable the
  submit button while sending.
- Keep each public surface its own lazy chunk (already done) so the public form and Wall
  do not download dashboard code.

## 5. Widget rules

- Capture the script origin synchronously at load:
  `const origin = new URL((document.currentScript as HTMLScriptElement).src).origin;`
- No framework, no `packages/shared` runtime imports (use `import type` only) to keep size small.
- One Shadow root per container; CSS lives inside it; nothing leaks to the host page.
- Every step wrapped so an error never breaks the host page (pattern already in `index.ts`).

## 6. Testing architecture

- Split API Vitest into two projects or configs: **unit** (no DB, fast) and **integration**
  (needs `TEST_DATABASE_URL`, runs `prisma migrate deploy` once, truncates tables between tests).
- Factories create a user + workspace + session in one call so tests stay short.
- CI: the `verify` job needs a Postgres service for integration tests (added in I02).
- E2E runs against the Docker stack, like the existing landing test.

## 7. Configuration

New env vars (add to `config.ts` Zod schema and `.env.example`):

| Var                | Example (local default) | Used by                      |
| ------------------ | ----------------------- | ---------------------------- |
| `APP_ORIGIN`       | `http://localhost:3000` | Origin check, embed snippet  |
| `SESSION_TTL_DAYS` | `7`                     | Sessions                     |
| `TRUST_PROXY_HOPS` | `0`                     | Rate limiting behind a proxy |

## 8. Decision records

`docs/decisions/` holds one short file per important decision (`0001-owner-only-role.md`
…). Template: Context · Decision · Consequences. PRD §6 (D1–D10) lists the starting
decisions; turn one into an ADR whenever someone (or Claude) wants to change it.

## 9. Things that need checking against current docs

These parts rely on fast-moving libraries. Verify in official docs before relying on them:

- Prisma 7 (`prisma.config.ts`, `adapter-pg`, composite relations, editing migration SQL).
- Express 5 error handling and async handler behaviour.
- express-rate-limit 8 options.
- Claude Code features used in `CLAUDE.md` and `.claude/` (subagents, skills, plan mode).
