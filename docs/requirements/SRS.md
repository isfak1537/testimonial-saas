# Software Requirements Specification — Testimonial SaaS

| Field | Value |
|---|---|
| Version | 2.0 (replaces SRS.docx v1.0) |
| Date | 30 October 2026 |
| Related | `docs/requirements/PRD.md` (what and why), `docs/architecture/ARCHITECTURE.md` (how), `docs/BUILD_ORDER.md` (when) |
| Scope | MUST and SHOULD items of PRD v2 (increments I01–I10) |

Every requirement has an ID. Code, tests and commit messages reference these IDs.
"Shall" = required. "Should" = recommended. Values marked *(initial)* are starting
points to tune, not measured facts.

## 1. Changes from v1.0 (conflicts resolved)

| v1.0 said | v2 says | Why |
|---|---|---|
| `Workspace.ownerUserId` | No owner column. Owner = `WorkspaceMember.role = OWNER` | One source of truth for ownership |
| Separate `ConsentRecord` table | Consent fields on `Testimonial` | One consent per testimonial; no sync bugs |
| `CollectionForm` + `CollectionQuestion` tables, form slug | Form settings on `Space`, slug on `Space`, prompts as a text array | One form per Space (PRD D3, D9) |
| 4 roles | `OWNER` only (enum kept for later) | No invite feature in MVP (PRD D1) |
| `Widget`, `AnalyticsEvent`, `MediaAsset`, `Invitation`, `Subscription`, `Tag` tables | Not in MVP | Out of scope (PRD §5) |
| Redis/BullMQ, object storage | Not in MVP | Text only (PRD D7) |
| `PATCH /testimonials/:id` (unscoped) | All dashboard routes nested under `/workspaces/:workspaceId/spaces/:spaceId` | Tenant scope is visible in every URL and checked by middleware |

## 2. Glossary

| Term | Meaning |
|---|---|
| Workspace | Tenant boundary. Owns members and Spaces. |
| Space | One product/brand. Has one public form, one Wall, many testimonials. |
| Testimonial | A customer's text, rating and attribution plus consent and status fields. |
| Moderation status | `PENDING`, `APPROVED` or `REJECTED`. |
| Published | `publishedAt IS NOT NULL`. Independent column from moderation status. |
| Public | Published AND approved AND consent not withdrawn AND not deleted AND Space not archived. |
| Tenant-scoped | A query that always filters by `workspaceId` taken from the verified membership, never from the request body. |

## 3. Functional requirements

### 3.1 Authentication (I03)

| ID | Requirement |
|---|---|
| FR-AUTH-01 | A visitor shall sign up with email, password and display name. Email is trimmed and lowercased. Password length 10–128 characters. Display name is trimmed, 1–80 characters. Request bodies are strict: unknown or forbidden keys (for example `workspaceId`, `role`) give `422 VALIDATION_FAILED`. |
| FR-AUTH-02 | Sign-up shall, in one database transaction, create the User, a Workspace named "{displayName}'s workspace", and a WorkspaceMember with role `OWNER`. |
| FR-AUTH-03 | Sign-up with an existing email shall return `409 EMAIL_TAKEN` with `details: [{ "path": "email", "message": … }]`. *(Accepted trade-off: reveals that an email is registered.)* |
| FR-AUTH-04 | Log-in shall return the same `401 INVALID_CREDENTIALS` for an unknown email and a wrong password, and shall run a password hash comparison in both cases. |
| FR-AUTH-05 | Passwords shall be hashed with argon2id. Plain passwords shall never be logged or stored. |
| FR-AUTH-06 | A successful sign-up or log-in shall create a server-side session and set cookie `sid` (HttpOnly, SameSite=Lax, Path=/, Max-Age = `SESSION_TTL_DAYS` days, default 7). `Secure` is set only when `APP_ORIGIN` is `https`. Logging in while already logged in deletes the old session and creates a new one. |
| FR-AUTH-07 | The session token shall be 32 random bytes (base64url). Only its SHA-256 hash is stored. Sessions expire `SESSION_TTL_DAYS` (default 7) days after creation; an expired session is treated as missing (`401`). |
| FR-AUTH-08 | Log-out shall delete the session row and clear the cookie. Return 204. |
| FR-AUTH-09 | `GET /auth/me`, and the bodies of a successful sign-up (201) and log-in (200), shall return `{ "user": { "id", "email", "displayName" }, "workspace": { "id", "name" }, "role" }`, built by an allowlist mapper; `me` without a valid session returns 401. |
| FR-AUTH-10 | Sign-up and log-in shall be rate limited per IP by one shared limiter. The maximum is `AUTH_RATE_LIMIT_MAX` (default 10 per 15 minutes) and is raised only in test and E2E configuration. The limiter runs before validation, password hashing and any database access; the response is `429 RATE_LIMITED` with `Retry-After`. |

### 3.2 Authorization and tenant isolation (I04, applies to every later increment)

| ID | Requirement |
|---|---|
| FR-TEN-01 | Every route under `/api/v1/workspaces/:workspaceId` shall require a valid session and a WorkspaceMember row for (workspaceId, userId). |
| FR-TEN-02 | If the user is not a member, or the Space/testimonial does not belong to that workspace, the API shall return `404 NOT_FOUND` (never 403), so existence is not revealed. |
| FR-TEN-03 | `workspaceId`, `spaceId`, `moderationStatus`, `publishedAt`, consent fields and IDs in a request body shall be ignored or rejected. Ownership comes only from the URL + verified membership. |
| FR-TEN-04 | Repository functions for tenant-owned data shall take `workspaceId` as a required argument and include it in every `where` clause. |
| FR-TEN-05 | The role check helper shall accept a list of allowed roles. In the MVP every dashboard route allows `OWNER`. A member without an allowed role gets `403 FORBIDDEN`. |

### 3.3 Spaces (I04)

| ID | Requirement |
|---|---|
| FR-SPACE-01 | Owner shall create a Space with name (1–80), slug, headline (1–120), message (0–500) and prompts (0–5 items, each 1–200). |
| FR-SPACE-02 | Slug shall match `^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$` (3–40 chars), be stored lowercase, and be globally unique. Input is lowercased before validation. Duplicate → `409 SLUG_TAKEN`. |
| FR-SPACE-03 | Reserved slugs shall be rejected: `admin, api, app, assets, c, embed, help, login, logout, signup, support, w, www`. |
| FR-SPACE-04 | Owner shall list (newest first, archived excluded unless `includeArchived=true`), read and update Spaces. Slug may be changed; old links then stop working (shown as a warning in the UI). |
| FR-SPACE-05 | Owner shall archive a Space (`archivedAt` set). Archived Spaces return 404 on all public endpoints and keep their slug reserved. |

### 3.4 Public collection (I06)

| ID | Requirement |
|---|---|
| FR-COL-01 | `GET /public/spaces/:slug/form` shall return only: Space name, headline, message, prompts, and the current consent `{version, text}`. Archived or unknown → 404. |
| FR-COL-02 | `POST /public/spaces/:slug/testimonials` shall accept: authorName (1–80), authorTitle (0–120, optional), authorEmail (optional, valid email, max 254), rating (integer 1–5), content (10–2000 after trimming), consent (must be `true`), consentVersion, website (honeypot). |
| FR-COL-03 | If `consentVersion` differs from the current version → `409 CONSENT_VERSION_OUTDATED` (UI asks the visitor to reload). |
| FR-COL-04 | If the honeypot `website` is non-empty, the API shall return 201 and store nothing. |
| FR-COL-05 | A stored testimonial shall have `moderationStatus = PENDING`, `publishedAt = NULL`, `consentVersion` = submitted version, `consentGrantedAt = now()`. |
| FR-COL-06 | Invalid input → `422 VALIDATION_FAILED` with field errors; nothing is stored. |
| FR-COL-07 | Submissions shall be rate limited per IP *(initial: 5 / 10 min)* and require a same-origin `Origin` header. |
| FR-COL-08 | The consent text and version shall live in `packages/shared/src/consent.ts`. A unit test shall pin the SHA-256 of each released version's text so a version's wording can never change silently. |

Consent text v1 (`2026-10-30.v1`):
> I agree that {Space name} may publish my name, title, rating and this testimonial on
> its website and marketing materials. I can ask {Space name} to remove it at any time.

### 3.5 Inbox and moderation (I07)

| ID | Requirement |
|---|---|
| FR-INB-01 | Owner shall list a Space's testimonials, excluding deleted ones, newest first, with filters `status` (`pending`/`approved`/`rejected`) and `published` (`true`/`false`). |
| FR-INB-02 | The list shall use cursor pagination: `limit` default 20, max 50; response includes `nextCursor` or `null`. |
| FR-INB-03 | Owner shall view a testimonial's full detail, including private `authorEmail`. |
| FR-INB-04 | Allowed transitions: PENDING→APPROVED, PENDING→REJECTED, APPROVED→REJECTED, REJECTED→APPROVED. Others → `409 INVALID_STATE`. Approving an already approved item is a 200 no-op. |
| FR-INB-05 | Rejecting a published testimonial shall also set `publishedAt = NULL` in the same transaction. |
| FR-INB-06 | Publish shall succeed only if APPROVED, consent not withdrawn and not deleted; otherwise `409 INVALID_STATE`. Publish and unpublish are idempotent. |
| FR-INB-07 | Withdraw consent shall set `consentWithdrawnAt = now()` and `publishedAt = NULL` in one transaction. It is irreversible; such an item can never be published again. |
| FR-INB-08 | Delete shall set `deletedAt = now()` and `publishedAt = NULL` (soft delete). Deleted items disappear from all lists and public output. |
| FR-INB-09 | The owner shall not be able to edit authorName, authorTitle, rating, content or consent fields (PRD D10). No endpoint exists for it. |
| FR-INB-10 | Approve, reject, publish, unpublish, withdraw-consent and delete shall each write an `AuditLog` row in the same transaction. |

### 3.6 Public Wall (I08)

| ID | Requirement |
|---|---|
| FR-WALL-01 | `GET /public/spaces/:slug/wall` shall return `{space: {name, headline}, testimonials: [...], nextCursor}`. |
| FR-WALL-02 | It shall include only **public** testimonials (see Glossary), ordered by `publishedAt` desc. |
| FR-WALL-03 | Each item shall contain exactly: `id, authorName, authorTitle, rating, content, publishedAt`. Built by an explicit allowlist mapper, never by spreading a database row. |
| FR-WALL-04 | Response headers: `Cache-Control: no-store`, `Access-Control-Allow-Origin: *`, no credentials. |
| FR-WALL-05 | Pagination: `limit` default 20, max 50. Rate limited per IP *(initial: 120 / min)*. |
| FR-WALL-06 | The page `/w/:slug` shall render this data as text (no HTML injection) in a responsive masonry layout. |

### 3.7 Embeddable widget (I09)

| ID | Requirement |
|---|---|
| FR-WID-01 | Embed snippet: `<div data-testimonial-widget data-space="{slug}" data-theme="light"></div>` + `<script async src="{origin}/embed/widget.v1.js"></script>`. |
| FR-WID-02 | The loader shall find every container, attach a Shadow DOM root, fetch the Wall endpoint from the script's own origin, and render items. |
| FR-WID-03 | Text shall be rendered only with `textContent` / `createTextNode`. `innerHTML` with API data is forbidden. |
| FR-WID-04 | It shall show a loading state, an empty state ("No testimonials yet"), and on error render nothing visible and never throw into the host page. |
| FR-WID-05 | `data-theme` accepts `light` or `dark` (default `light`); `data-limit` 1–50 (default 12). |
| FR-WID-06 | Bundle shall stay under 30 KB gzipped (existing CI check). Script served with `Cache-Control: public, max-age=300`. |
| FR-WID-07 | The dashboard Embed tab shall show the snippet with a copy button and a live preview. |

### 3.8 Operations (I10)

| ID | Requirement |
|---|---|
| FR-OPS-01 | `pnpm -F @testimonial-saas/api purge:deleted` shall hard-delete testimonials with `deletedAt` older than 30 days and print the count. Dry-run by default; `--confirm` to delete. |
| FR-OPS-02 | `GET /api/v1/health` shall also report database reachability (`{status, db}`); 503 if the database is down. |

## 4. Data model

PostgreSQL 16, Prisma 7. All IDs are UUIDs. All timestamps are `timestamptz` in UTC.
Prisma model names are PascalCase; table/column mapping follows Prisma defaults unless the
implementer adds `@@map` consistently.

### 4.1 Tables

**User** — `id`, `email` (unique, lowercase), `passwordHash`, `displayName` (1–80), `createdAt`, `updatedAt`

**Session** — `id`, `tokenHash` (unique), `userId` → User (cascade delete), `createdAt`, `expiresAt`. Index on `expiresAt`.

**Workspace** — `id`, `name`, `createdAt`, `updatedAt`. *(No owner column.)*

**WorkspaceMember** — `workspaceId` → Workspace, `userId` → User, `role` (enum `MemberRole { OWNER }`), `createdAt`. Primary key (`workspaceId`, `userId`).

**Space** — `id`, `workspaceId` → Workspace, `name`, `slug` (unique), `headline`, `message`, `prompts` (`text[]`), `archivedAt?`, `createdAt`, `updatedAt`. Unique (`id`, `workspaceId`) to allow the composite foreign key below.

**Testimonial** — `id`, `workspaceId`, `spaceId`, `authorName`, `authorTitle?`, `authorEmail?`, `rating` (int), `content`, `moderationStatus` (enum `PENDING|APPROVED|REJECTED`, default `PENDING`), `publishedAt?`, `consentVersion`, `consentGrantedAt`, `consentWithdrawnAt?`, `deletedAt?`, `createdAt`, `updatedAt`.
Foreign key (`spaceId`, `workspaceId`) → Space (`id`, `workspaceId`). This makes it impossible to store a testimonial whose workspace differs from its Space's workspace.

**AuditLog** — `id`, `workspaceId` → Workspace, `actorUserId?` → User (set null on delete), `action` (text, e.g. `testimonial.publish`), `targetType`, `targetId`, `metadata` (jsonb, no PII), `createdAt`. Index (`workspaceId`, `createdAt`).

### 4.2 Database constraints (added as raw SQL in the migration)

Prisma schema cannot express CHECK constraints, so the I02 migration SQL shall be edited to add:

```sql
ALTER TABLE "Space" ADD CONSTRAINT space_slug_lowercase CHECK (slug = lower(slug));
ALTER TABLE "Testimonial" ADD CONSTRAINT testimonial_rating_range CHECK (rating BETWEEN 1 AND 5);
-- Defence in depth for PRD D4/D5: the database itself refuses an unpublishable published row.
ALTER TABLE "Testimonial" ADD CONSTRAINT testimonial_publish_guard CHECK (
  "publishedAt" IS NULL OR (
    "moderationStatus" = 'APPROVED'
    AND "consentWithdrawnAt" IS NULL
    AND "deletedAt" IS NULL
  )
);
```

Column names above assume Prisma's default naming; adjust if `@map` is used. A test shall
prove the database rejects a direct update that violates `testimonial_publish_guard`.

### 4.3 Indexes

- Testimonial (`spaceId`, `createdAt` desc) — inbox
- Testimonial (`spaceId`, `publishedAt` desc) — Wall (a partial index `WHERE "publishedAt" IS NOT NULL` is optional)

## 5. API specification

Base path `/api/v1`. JSON only (`Content-Type: application/json` required on bodies).
Body limit 16 KB. Timestamps ISO 8601 UTC.

### 5.1 Error envelope

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Human readable", "requestId": "uuid", "details": [{ "path": "content", "message": "Too short" }] } }
```

| Status | Code | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Malformed JSON, wrong content type |
| 401 | `UNAUTHENTICATED` / `INVALID_CREDENTIALS` | No/expired session; bad login |
| 403 | `FORBIDDEN` | Member without required role; failed Origin check |
| 404 | `NOT_FOUND` | Missing, or not in the caller's tenant |
| 409 | `EMAIL_TAKEN`, `SLUG_TAKEN`, `INVALID_STATE`, `CONSENT_VERSION_OUTDATED` | Conflicts. `EMAIL_TAKEN` and `SLUG_TAKEN` include `details: [{ path, message }]` naming the field. |
| 422 | `VALIDATION_FAILED` | Zod validation failed |
| 429 | `RATE_LIMITED` | Rate limit hit (`Retry-After` header) |
| 500 | `INTERNAL` | Unexpected error; message is generic, details only in logs |

### 5.2 Endpoints

| Method | Path | Access | Req |
|---|---|---|---|
| GET | `/health` | Public | FR-OPS-02 |
| POST | `/auth/signup` | Public, rate limited | FR-AUTH-01..03 |
| POST | `/auth/login` | Public, rate limited | FR-AUTH-04 |
| POST | `/auth/logout` | Session | FR-AUTH-08 |
| GET | `/auth/me` | Session | FR-AUTH-09 |
| GET | `/workspaces/:workspaceId/spaces` | Owner | FR-SPACE-04 |
| POST | `/workspaces/:workspaceId/spaces` | Owner | FR-SPACE-01..03 |
| GET | `/workspaces/:workspaceId/spaces/:spaceId` | Owner | FR-SPACE-04 |
| PATCH | `/workspaces/:workspaceId/spaces/:spaceId` | Owner | FR-SPACE-04 |
| POST | `/workspaces/:workspaceId/spaces/:spaceId/archive` | Owner | FR-SPACE-05 |
| GET | `/workspaces/:workspaceId/spaces/:spaceId/testimonials` | Owner | FR-INB-01..02 |
| GET | `.../testimonials/:testimonialId` | Owner | FR-INB-03 |
| POST | `.../testimonials/:testimonialId/approve` | Owner | FR-INB-04 |
| POST | `.../testimonials/:testimonialId/reject` | Owner | FR-INB-04..05 |
| POST | `.../testimonials/:testimonialId/publish` | Owner | FR-INB-06 |
| POST | `.../testimonials/:testimonialId/unpublish` | Owner | FR-INB-06 |
| POST | `.../testimonials/:testimonialId/withdraw-consent` | Owner | FR-INB-07 |
| DELETE | `.../testimonials/:testimonialId` | Owner | FR-INB-08 |
| GET | `/public/spaces/:slug/form` | Public | FR-COL-01 |
| POST | `/public/spaces/:slug/testimonials` | Public, same-origin, rate limited | FR-COL-02..07 |
| GET | `/public/spaces/:slug/wall` | Public, CORS `*`, rate limited | FR-WALL-01..05 |

Request/response Zod schemas live in `packages/shared/src/contracts/` and are used by both
the API (validation) and the web app (types).

## 6. Security requirements

| ID | Requirement |
|---|---|
| SEC-01 | All tenant rules in §3.2. |
| SEC-02 | CSRF: every non-GET request under `/api/v1` (including the public submission POST) shall have an `Origin` header equal to `APP_ORIGIN` (env var), otherwise `403 FORBIDDEN`. There is one `APP_ORIGIN` per environment (the Vite dev server uses `http://localhost:5173`); it has no default when `NODE_ENV=production`, and in production it must be `https` unless the host is `localhost` or `127.0.0.1`. Combined with SameSite=Lax cookies and JSON-only bodies. |
| SEC-03 | Responses shall set `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`. HTML responses shall set `X-Frame-Options: DENY` and a Content-Security-Policy starting from `default-src 'self'; frame-ancestors 'none'` (verify the SPA still loads). |
| SEC-04 | Logs shall redact `cookie`, `set-cookie`, `password`, `passwordHash`, `authorEmail`, and session tokens. |
| SEC-05 | User text is rendered only as text: React default escaping in web (`dangerouslySetInnerHTML` forbidden), `textContent` in widget. |
| SEC-06 | Public responses are built by allowlist mappers (FR-WALL-03). Never return `authorEmail`, consent fields, `moderationStatus`, `deletedAt`, `workspaceId` publicly. |
| SEC-07 | Rate limiter is in-memory (single instance). If deployed behind a proxy, Express `trust proxy` shall be set to the exact hop count, never `true`. |
| SEC-08 | No secrets in Git. New env vars go in `.env.example` with safe local defaults. |
| SEC-09 | The product shall not claim legal compliance (GDPR or other) anywhere. |

## 7. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-01 | TypeScript strict in all packages; no `any` without a comment explaining why. |
| NFR-02 | Every request gets a `requestId` (UUID), returned in `X-Request-Id` and in error bodies, and logged by pino. |
| NFR-03 | List endpoints paginate (max 50). |
| NFR-04 | Public form and dashboard are keyboard usable with visible focus and labelled inputs; Playwright runs an axe check on the public form and Wall *(axe is already a dev dependency)*. |
| NFR-05 | Widget < 30 KB gzipped (CI). |
| NFR-06 | `pnpm verify` and the E2E suite pass in CI before an increment is accepted. |
| NFR-07 | Latency, uptime and backup targets are not set for the MVP (no production deployment yet). |

## 8. Testing requirements

| Level | Tool | Must cover |
|---|---|---|
| Unit | Vitest | Zod contracts, slug rules, state transitions, allowlist mappers, consent text hash |
| Integration | Vitest + Supertest + `db-test` Postgres | Every endpoint: happy path, validation error, unauthenticated, **cross-tenant (user B → user A's IDs returns 404)** |
| Database | Vitest + raw SQL | `testimonial_publish_guard` rejects invalid rows; composite FK rejects mismatched workspace |
| Security | Vitest / Playwright | XSS payload `<img src=x onerror=alert(1)>` renders as text on Wall and widget; public JSON contains no `authorEmail` |
| E2E | Playwright | Golden path (PRD §8 steps 1–5) |

## 9. Traceability

| PRD | SRS | Increment | Verified by |
|---|---|---|---|
| PRD-01 | FR-AUTH-* | I03 | auth integration tests, E2E |
| PRD-02 | FR-SPACE-*, FR-TEN-* | I04, I05 | spaces tests incl. cross-tenant |
| PRD-03, PRD-04 | FR-COL-* | I06 | submission tests, consent hash test |
| PRD-05, 06, 07 | FR-INB-* | I07 | transition tests, DB guard test, audit tests |
| PRD-08 | FR-WALL-* | I08 | public API allowlist + XSS tests |
| PRD-09 | FR-WID-* | I09 | widget unit + Playwright embed test |
| PRD-10 | FR-OPS-*, §8 | I10 | golden-path E2E |
