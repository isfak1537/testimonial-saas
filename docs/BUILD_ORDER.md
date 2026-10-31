# Official Build Order — Testimonial SaaS MVP

| Field      | Value                                              |
| ---------- | -------------------------------------------------- |
| Version    | 1.0 — replaces the never-written I00–I21 roadmap   |
| Date       | 30 October 2026                                    |
| Increments | I00 (done) + I01–I10, optional I11                 |
| Goal       | MUST items (I01–I08) in ~24 hours of calendar time |

The old plan had 22 increments. That was planned for a much larger scope. With PRD v2 the
work fits into 10 increments. Old references in code comments (`I18/I19` in the widget,
`I21` in the landing page) are updated in I01.

## 0. How to use this file

**Time estimates are the mentor's guesses for Claude Code doing the coding and you
reviewing. They are not measured.** Your real speed will show after I01–I02; re-plan then.

**Cut line:** If time runs out, stop after a finished increment, never in the middle.

- After I04: backend demo with tests only
- After I08: **full MVP demo** (this is the real target)
- After I10: MVP + widget + hardening

**Two owner checkpoints per increment** (to fit 24 hours while keeping control):

1. **Plan gate** — Claude shows the plan; you reply "approved" or ask for changes.
2. **Ship gate** — Claude shows the completion report; you check it, then reply
   "commit and push approved". (Still an explicit approval, just one message for both.)

PRs and merges to `main` happen at milestones only: after I04, I08 and I10.

**Between increments:** run `/clear` (fresh context), so Claude reads `CLAUDE.md` and this
file again instead of relying on a long, drifting conversation.

### Standard prompt (copy for every increment)

```
Implement increment I0X from docs/BUILD_ORDER.md.
1. Read CLAUDE.md, the I0X section of docs/BUILD_ORDER.md, and the SRS requirements it lists.
2. Use plan mode. Show me: files to create/modify, data or API changes, tests you will
   write (including cross-tenant tests if tenant data is touched), and anything unclear.
3. Wait for my approval. Then implement only that scope.
4. Run the targeted tests, then `pnpm verify`. Fix failures.
5. Use the security-reviewer subagent on your diff and address its findings.
6. Give me the completion report from CLAUDE.md. Do not commit until I approve.
```

---

## Step 0 — Housekeeping (owner, ~30 min, before I01)

1. Merge I00: open a PR `feat/i00-foundation` → `main`, check CI is green on GitHub
   yourself, merge.
2. Create branch `feat/mvp` from `main`. CI runs on every push to `feat/**` (already configured).
3. Copy in the new files: `CLAUDE.md`, `docs/requirements/PRD.md`, `docs/requirements/SRS.md`,
   `docs/architecture/ARCHITECTURE.md`, `docs/BUILD_ORDER.md`, `.claude/agents/security-reviewer.md`.
4. Keep the old `.docx` files locally only (they stay gitignored). The Markdown files are
   now the source of truth. Decide whether the Markdown docs may be public; if not, make
   the repository private before pushing them.
5. Optional: set `git config user.email` to your GitHub noreply address for future commits.
6. Commit: `docs: PRD v2, SRS v2, architecture, build order, CLAUDE.md`.

---

## I01 — API foundation (~1 h)

**Goal:** every request has an ID, structured logs, a standard error envelope and safe headers.
**SRS:** §5.1, NFR-02, SEC-03, SEC-04 (redaction), FR-OPS-02 (health without DB part).

Scope:

- `http/errors.ts`, `error-handler.ts`, `request-id.ts`, `security-headers.ts`, `validate.ts`
- pino request logging with redaction list; `X-Request-Id` response header
- `express.json({ limit: "16kb" })`; non-JSON body on POST → 400 `BAD_REQUEST`
- Replace the placeholder API 404 with the envelope (keeps `code: NOT_FOUND`)
- `createApp` accepts `{ config, ... }` so tests can inject settings
- Update stale comments: widget `I18/I19` → `I09`, landing `I21` → `I10`, `router.tsx` → `App.tsx`

Acceptance:

- [ ] Unknown `/api/v1/x` → 404 envelope with `requestId` matching `X-Request-Id`
- [ ] Thrown error in a test route → 500 `INTERNAL`, no stack in body, stack in logs
- [ ] Zod failure in a test route → 422 with `details[]`
- [ ] Security headers present on API and HTML responses; SPA still loads in E2E
- [ ] Existing 18 API tests and landing E2E still pass

---

## I02 — Database schema and test harness (~1.5 h)

**Goal:** all MVP tables exist with constraints; integration tests can use a real database.
**SRS:** §4 (all), §8 database row.

Scope:

- Prisma models: User, Session, Workspace, WorkspaceMember, Space, Testimonial, AuditLog
- First migration + hand-added SQL from SRS §4.2
- `db/client.ts`, `db/types.ts`
- Test helpers: migrate test DB once, truncate between tests, factories
- Split unit vs integration test runs; add a Postgres service to the CI `verify` job
- Health endpoint reports DB status (FR-OPS-02)

Acceptance:

- [ ] `prisma migrate dev` creates all tables on a fresh DB
- [ ] Test proves `testimonial_publish_guard` rejects `publishedAt` on a PENDING row
- [ ] Test proves the composite FK rejects a testimonial whose `workspaceId` ≠ its Space's
- [ ] Test proves a duplicate slug and a non-lowercase slug are rejected by the DB
- [ ] CI green with the integration tests running

---

## I03 — Authentication API (~1.5 h)

**Goal:** sign up, log in, log out, me — with server-side sessions.
**SRS:** FR-AUTH-01..10, SEC-02 (origin check), §3.2 `requireSession`.

Scope: `modules/auth/*`, `http/auth-context.ts` (`requireSession`), `http/origin-check.ts`,
`http/rate-limits.ts` (auth limiter), shared `contracts/auth.ts`, config `APP_ORIGIN`,
`SESSION_TTL_DAYS`.

Acceptance:

- [ ] Sign-up creates user + workspace + OWNER membership in one transaction (test rolls back on failure)
- [ ] Cookie flags correct; DB stores only the token hash
- [ ] Wrong password and unknown email give identical 401 responses
- [ ] Expired session → 401; logout deletes the session
- [ ] POST without matching `Origin` → 403
- [ ] 11th login attempt in the window → 429
- [ ] No password or token appears in captured logs (test with a log spy)

---

## I04 — Tenancy and Spaces API (~1.5 h) → **Milestone PR 1**

**Goal:** owners manage Spaces; other users cannot touch them.
**SRS:** FR-TEN-01..05, FR-SPACE-01..05.

Scope: `requireMember`, `modules/workspaces/members.repo.ts`, `modules/spaces/*`,
`contracts/spaces.ts`, slug validator with reserved list.

Acceptance:

- [ ] CRUD + archive work for the owner
- [ ] Slug: lowercased, regex enforced, reserved rejected, duplicate → 409 `SLUG_TAKEN`
- [ ] **Cross-tenant:** user B gets 404 on list/get/update/archive for user A's workspace and Space; A's data unchanged
- [ ] Body fields `workspaceId`/`id` are ignored or rejected (test)
- [ ] Then: PR `feat/mvp` → `main`, you check CI, you merge

---

## I05 — Dashboard: auth and Spaces UI (~2 h)

**Goal:** a real user can sign up and manage Spaces in the browser.
**SRS:** FR-AUTH-* (UI), FR-SPACE-* (UI), NFR-04.

Scope: `api/client.ts`, `AuthProvider`, `RequireAuth`, real `/signup` and `/login` pages,
`/app` Spaces list, new Space form, `SpaceLayout` with tabs (Inbox/Collection/Wall/Embed/Settings
as empty placeholders except Settings = edit + archive).

Acceptance:

- [ ] E2E: sign up → land on empty Spaces list → create Space → see it listed
- [ ] `/app/**` redirects to `/login` when logged out
- [ ] Field errors from the API show next to the right inputs
- [ ] Keyboard-only run through sign-up works

Subagent tip: none needed. One session, UI only.

---

## I06 — Public collection form (~1.5 h)

**Goal:** customers can submit a testimonial with consent.
**SRS:** FR-COL-01..08.

Scope: `packages/shared/src/consent.ts` with pinned hash test, `modules/public` form +
submission routes, submission rate limiter, honeypot, `/c/:slug` page with thank-you
state, dashboard Collection tab showing the link with copy button.

Acceptance:

- [ ] Valid submission → 201, row stored as PENDING with consent fields
- [ ] Missing consent / bad rating / short text → 422, nothing stored
- [ ] Old consent version → 409 `CONSENT_VERSION_OUTDATED`
- [ ] Honeypot filled → 201, nothing stored
- [ ] Archived/unknown slug → 404 on both endpoints
- [ ] axe check passes on `/c/:slug`

---

## I07 — Inbox and moderation (~2.5 h)

**Goal:** owner reviews, approves, publishes, and removes testimonials.
**SRS:** FR-INB-01..10.

Scope: `modules/testimonials/*` (service holds the transition table), `audit.repo.ts`,
`contracts/testimonials.ts`, Inbox tab with status/published filters, pagination,
detail panel, action buttons with confirmation for delete and withdraw-consent.

Subagent tip (good practice for learning parallel work):

1. Main session writes `contracts/testimonials.ts` first and commits nothing yet.
2. Subagent A: API + tests (`apps/api/**` only). Subagent B: Inbox UI (`apps/web/**` only).
3. Main session integrates, runs `pnpm verify` and the E2E, then reports.

Acceptance:

- [ ] Every allowed transition works; every disallowed one → 409 `INVALID_STATE` (table-driven test)
- [ ] Publish fails for pending, rejected, withdrawn, deleted
- [ ] Reject / withdraw / delete of a published item clears `publishedAt`
- [ ] Each action writes exactly one AuditLog row (in the same transaction)
- [ ] **Cross-tenant** 404 tests for list, detail and every action
- [ ] Pagination: 25 items → page 1 has 20 + cursor, page 2 has 5 + null

---

## I08 — Public Wall (~1 h) → **Milestone PR 2 — MVP demo**

**Goal:** published testimonials are visible to the world, and nothing else is.
**SRS:** FR-WALL-01..06, SEC-05, SEC-06.

Scope: `listPublicTestimonials` repo function, `toPublicTestimonial` mapper, Wall route
with CORS `*` + `no-store` + limiter, `/w/:slug` page (CSS columns masonry), Wall tab
in dashboard with "Open public page" link.

Acceptance:

- [ ] Only public items appear; one test per excluded case (pending, rejected, unpublished, withdrawn, deleted, archived Space)
- [ ] Response JSON keys are exactly the allowlist (snapshot test); no `authorEmail` anywhere
- [ ] XSS payload renders as visible text
- [ ] **Golden-path E2E** (PRD §8 steps 1–5) passes
- [ ] Then: you run the demo yourself on Docker, PR → `main`, merge

---

## I09 — Embeddable widget (~1.5 h, SHOULD)

**Goal:** one snippet shows the Wall on any website.
**SRS:** FR-WID-01..07.

Scope: `packages/widget/src/{api,render,styles}.ts`, Embed tab with snippet, copy button,
live preview; Playwright test with a plain HTML host page served from a different port
that has hostile CSS (`* { color: red !important }`).

Acceptance:

- [ ] Widget renders published items; host CSS does not change them; widget CSS does not leak out
- [ ] Network failure → nothing visible, no console errors thrown to the host
- [ ] XSS payload renders as text
- [ ] Size check still < 30 KB gzipped

---

## I10 — Hardening and docs (~1.5 h, SHOULD) → **Milestone PR 3**

**Goal:** confidence, not features.
**SRS:** FR-OPS-01, §8 security row, NFR-04, NFR-06.

Scope: purge script (dry-run default), extra security tests (public JSON never contains
private fields across all public endpoints), axe on Wall, README update (setup, demo
script, known limitations), remove the landing "development banner" if appropriate,
update `CLAUDE.md` if commands/structure changed.

Acceptance:

- [ ] Purge dry-run lists, `--confirm` deletes only items older than 30 days (test with fixed clock)
- [ ] README lets a stranger run the demo from a fresh clone
- [ ] All CI jobs green; you have watched the demo work end to end

---

## I11 — Deployment (COULD, after the 24 hours)

Needs owner decisions first: hosting provider, managed Postgres, domain, `APP_ORIGIN`,
`TRUST_PROXY_HOPS`, backups. Do not start without a written plan approved by the owner.

Acceptance (added after I06):

- [ ] `trust proxy` is configured for the deployment (exact hop count, SEC-07) and the per-IP
      limiters (auth and public submission) are verified behind it: two clients get separate buckets

## Later backlog (not scheduled)

Analytics (no cookies, no stored IPs), tags and search, featured + manual order, carousel
layout, password reset and email verification, team invites and roles, video, imports.
Each needs a PRD update before it gets an increment number.
