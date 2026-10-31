# 0001 — MVP implementation decisions (I02–I05)

| Field  | Value                                 |
| ------ | ------------------------------------- |
| Status | Accepted by the owner, 30 Oct 2026    |
| Scope  | I02 database and I03–I05 auth, Spaces |

## Context

The SRS and architecture documents leave several implementation details open or in tension
(see the I02–I05 planning review). These decisions close them so the increments do not
re-litigate them. Where a decision changes an SRS requirement, the SRS is updated in the
increment named below.

## Decisions

### I02 — database and test harness

1. Integration tests share one test database (`db-test`, port 54330), truncated between
   tests; test files run one at a time. The truncate helper never touches `_prisma_migrations`.
2. `prisma migrate deploy` runs when the API container starts. If it fails, the container
   stops (fail fast). The CI e2e job has its own Postgres service and runs the same command.
3. Prisma default table and column names (no `@@map`), so the SRS §4.2 SQL applies as written.
4. Foreign keys: Space→Workspace, Testimonial→Workspace, Testimonial→Space (composite) and
   AuditLog→Workspace are `Restrict`; Session→User and WorkspaceMember→Workspace/User are
   `Cascade`; AuditLog.actor→User is `SetNull`.
5. `GET /api/v1/health` returns `{status:"ok",db:"up"}` or 503 `{status:"degraded",db:"down"}`
   with a 2-second database ping timeout.
6. Integration tests are part of `pnpm verify`. `verify` starts the test database first
   (`pnpm db:test:up`); CI starts it the same way.
7. Migrations are created with `prisma migrate dev --create-only`, hand-edited (CHECK
   constraints), then applied. An applied migration is never edited; changes are new migrations.
8. One commit per increment on `feat/mvp`; a PR only at milestones (after I04, I08, I10).

### I03 — authentication (SRS updates in I03)

- `GET /auth/me` returns `{user:{id,email,displayName}, workspace:{id,name}, role}`, built by
  an allowlist mapper.
- One per-IP limiter covers sign-up and log-in together. The maximum comes from
  `AUTH_RATE_LIMIT_MAX` (default 10 per 15 minutes) and is raised only in test and E2E
  configuration. Documented in `.env.example`.
- Logging in while already logged in is allowed: the old session is deleted and a new one created.
- `cookie-parser` (exact version pin) reads cookies; `res.cookie` sets them.
- The cookie `Secure` flag is set only when `APP_ORIGIN` is `https`. SRS FR-AUTH-06 is updated.
- There is one `APP_ORIGIN` per environment. Vite dev uses `http://localhost:5173`. The dev
  proxy does not rewrite `Origin`. Playwright API requests send `Origin` explicitly.
- Request bodies are strict Zod objects; unknown or forbidden keys give 422.

### I04 — Spaces (SRS updates in I04)

- The Space list uses cursor pagination (default 20, max 50) through a helper that I07
  reuses. SRS FR-SPACE-04 is updated; the UI gets a "Load more" button.
- An archived Space is read-only: `PATCH` returns 409 `INVALID_STATE`. There is no unarchive in the MVP.
- 409 `EMAIL_TAKEN` and `SLUG_TAKEN` include `details:[{path,message}]`. Noted in SRS §5.1.
- Prisma `P2002` is mapped to an error code only after checking `meta.target`; an unknown
  target stays a 500.

### I05 — dashboard

- Web tests use Playwright plus pure unit tests only; no React Testing Library or jsdom.
- A 401 during a session clears the auth state and redirects to `/login` with a message.
- Errors that belong to no field appear in a `role="alert"` banner above the form.

## Consequences

- `pnpm verify` needs Docker running locally.
- The auth limiter must be configurable, or E2E suites that create many users will hit 429.
- SRS FR-AUTH-06, FR-SPACE-04 and §5.1 must be edited in I03/I04 to match these decisions.

## Follow-ups

Found in the I02 security review; each is scheduled in the increment named.

- **I03:** `/health` runs a database ping on every request. Cache the result for 1–2 seconds
  or use an exempt limiter. The Docker healthcheck must never receive 429.
- **I04 (done):** `Space.prompts` is nullable in the database (Prisma lists are). The Space mapper
  returns `[]` for `null`.
- **I07 (done, `modules/audit/audit.repo.ts`):** audit writers take `workspaceId` from the verified membership, never from input.
- **I11:** use a separate migrator database role. Today the container runs migrations with the
  application's credentials.
- **I10:** purge expired `Session` rows. I03 rejects them on read but never deletes them.
- **I11:** decide `trust proxy` (exact hop count, SEC-07) before any proxied deployment. Behind a
  proxy without it every client shares one rate-limit bucket (the proxy's IP).
- **Accepted trade-off (I03):** sign-up returns `409 EMAIL_TAKEN`, so it reveals whether an email is
  registered (FR-AUTH-03). The per-IP limiter slows enumeration; it does not prevent it.
- **I10:** sign-up does not invalidate a session the caller already holds (FR-AUTH-06 only requires
  replacement on log-in). Decide whether sign-up should delete it too.
- **I04 (done, `db/unique-violation.ts`):** the slug `P2002` mapping must read `meta.driverAdapterError.cause.constraint`
  (`index` / `fields`), because with Prisma 7 and the pg adapter `meta.target` is absent. See
  `isEmailUniqueViolation` in `modules/auth/auth.service.ts`.
- **Intentional (I03):** `"sideEffects": false` in `packages/shared/package.json` keeps zod out of
  the web bundle (the web app imports only `PRODUCT_NAME`). Do not remove it.
- **Config (I03):** in production `APP_ORIGIN` must be https unless the host is `localhost` or
  `127.0.0.1`, so a mistyped http origin cannot yield a non-Secure session cookie.
- **I06 (accepted limitation):** the consent text embeds the Space name, but a testimonial stores only
  `consentVersion` (the template version). If the owner later renames the Space, the text a visitor
  agreed to can no longer be reproduced exactly. Storing the rendered text or the Space name at
  submission time is a schema change, deferred; revisit before any claim that consent is auditable.
- **I10:** spam defence in I06 is the honeypot plus the per-IP limiter only (5 per 10 minutes). Stronger
  measures (CAPTCHA or proof of work, per-Space limits, email verification, moderation hints) belong to I10.
- **I10:** the `website` honeypot can be filled by browser autofill or password managers. A real visitor
  then gets a silent "Thank you" and nothing is stored. Fix: rename the field (an SRS FR-COL-02
  contract change) and add a time-to-submit check.
