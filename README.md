# Testimonial SaaS

> "Testimonial SaaS" is a temporary working name, defined once in
> `packages/shared/src/brand.ts`.

A multi-tenant app for collecting customer testimonials, reviewing them before they go
public, and publishing approved ones on a public Wall and an embeddable widget. It is built
incrementally as a student project; `main` contains the MVP (increments I00–I10).
It is a local demo: there is no production deployment yet.

## Stack

Modular monolith: React + TypeScript + Vite (web), Node.js 24 + Express 5 (API),
PostgreSQL 16 + Prisma 7, Docker Compose, pnpm workspaces.

```
apps/api          Express API; also serves the built web app and /embed/*
apps/web          React SPA: / (landing), /login, /signup, /app/**, /c/:slug, /w/:slug
packages/shared   Code shared by web and API (product name, Zod contracts, consent text)
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
docker compose up -d --build --wait   # db + api on http://localhost:3000
```

Running the demo needs only Docker: the image installs dependencies and builds everything
itself (`Dockerfile`), and applies database migrations on start. Run `pnpm install` on the host
only for development, the tests and `pnpm verify`.

To stop the stack run `docker compose down`. It keeps the database data. `docker compose down -v`
also deletes the database data, so use it only when you want a reset.

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

### Maintenance: purge

```sh
pnpm build                                              # the script runs from compiled output
DATABASE_URL=postgresql://testimonial:testimonial_dev@localhost:54320/testimonial \
  pnpm -F @testimonial-saas/api purge:deleted            # dry-run: prints counts, deletes nothing
DATABASE_URL=... pnpm -F @testimonial-saas/api purge:deleted --confirm
# or inside the running stack:
docker compose exec api pnpm -F @testimonial-saas/api purge:deleted [--confirm]
```

It first prints the target database name and the counts. `--confirm` hard-deletes testimonials
that were deleted more than 30 days ago and sessions that have expired. Nothing else is touched.

## Demo script

Start the stack (see Getting started), open http://localhost:3000, then:

1. **Sign up** (Get started) and create a **Space** with a slug such as `acme`.
2. **Collect.** Copy the link from the Collection tab and open it in a private window.
   Fill in the form, tick the consent box and send it. (Submissions are limited to 5 per
   10 minutes per IP; that is by design.)
3. **Review.** Back in the dashboard, open the Inbox: the item is Pending. Approve it, then Publish it.
4. **Wall.** Open `/w/acme`: the testimonial is there.
5. **Widget.** Copy the snippet from the Embed tab, then serve it from a different origin:
   - Create an empty folder outside this repository, for example `~/embed-test`.
   - In it, create `index.html` with the snippet in the body (your snippet has your Space slug):
     ```html
     <!doctype html>
     <html>
       <body>
         <div data-testimonial-widget data-space="acme" data-theme="light"></div>
         <script async src="http://localhost:3000/embed/widget.v1.js"></script>
       </body>
     </html>
     ```
   - In that folder run `python3 -m http.server 8000` and open http://localhost:8000.

   The page (port 8000) and the API (port 3000) are different origins, which is the point of
   the test. The same testimonial appears. Stop the server with Ctrl+C.

6. **Unpublish** it in the Inbox and refresh the Wall: it is gone.
7. **Isolation.** Sign up as a second user (another browser profile): they see none of the
   first user's Spaces or testimonials.

### Embedding and versioning

The widget is `/embed/widget.v1.js`, cached for 5 minutes. A change that would break existing
embeds ships as a new file (`widget.v2.js`); `v1` is never edited incompatibly.

## Known limitations

- **Spam defence is minimal:** a hidden honeypot field, a per-IP rate limit and moderation
  (nothing is public until you approve and publish it). No CAPTCHA or email verification.
- **Consent text is not auditable.** The text a visitor agreed to embeds the Space name, but only
  the template version is stored. If a Space is renamed, the exact text can no longer be
  reproduced. This is not a record that meets any legal standard, and the product makes no
  legal-compliance claim.
- **Sign-up reveals whether an email is registered** (it answers "already exists"). The per-IP
  limiter slows enumeration; it does not prevent it.
- **Wall requests can return 429** (120 per minute per IP) behind a shared NAT or on a page with
  very many widgets; the widget then shows nothing.
- **The collection form read is limited** to 60 per minute per IP (`FORM_RATE_LIMIT_MAX`); the default is a judgment, not measured.
- **No HTTPS yet.** The session cookie is `Secure` only when `APP_ORIGIN` is https.
  Deployment is a later increment.
- No password reset, email verification, team invites or roles; one owner per workspace.
- Rate limiters are in memory, per process.
- **`TRUST_PROXY_HOPS`** (default `0`, trust nothing) sets Express's `trust proxy` to a hop count
  so the per-IP limiters see the client address behind a reverse proxy. The number must equal the
  real number of proxies in front of the API: too low and visitors share the proxy's rate-limit
  bucket, too high and a client can supply its own address. Only a whole number from 0 to 10 is
  accepted; `true`, `*` and address lists stop the app at startup. The Express docs
  (https://expressjs.com/en/guide/behind-proxies.html) warn for a number: "it is important to
  ensure there are not multiple, different-length paths to the Express application such that the
  client can be less than the configured number of hops away, otherwise it may be possible for
  the client to provide any value."
- The API image keeps dev dependencies so the toolchain check and migrations can run in it.
- The public pages are a single-page app: content appears after JavaScript loads and is not
  server-rendered for SEO.
- The I08 test that drops the publish guard can leave it dropped in the test database if the
  test process is killed; recreate the test database (`docker compose down -v`, `pnpm db:test:up`).

## Features: done and not done

Source: [`docs/requirements-check.md`](docs/requirements-check.md), which was checked at commit
`f1faed4` and last edited in PR #8 (`0fba51b`); `main` was `c81d9d7` when this section was written. The data model is in
[`docs/data-model.md`](docs/data-model.md). The check covers the 69 requirement IDs of the SRS.

| Group    | Done | Partial | Deferred |
| -------- | ---- | ------- | -------- |
| FR-AUTH  | 10   | 0       | 0        |
| FR-TEN   | 5    | 0       | 0        |
| FR-SPACE | 5    | 0       | 0        |
| FR-COL   | 8    | 0       | 0        |
| FR-INB   | 9    | 1       | 0        |
| FR-WALL  | 6    | 0       | 0        |
| FR-WID   | 7    | 0       | 0        |
| FR-OPS   | 2    | 0       | 0        |
| SEC      | 8    | 1       | 0        |
| NFR      | 6    | 0       | 1        |
| **All**  | 66   | 2       | 1        |

Not done: 0 of the 69 IDs. The unit and integration tests ran in the check's `pnpm verify` run;
the E2E tests (51 passed, Chromium only) ran in CI run 41239555561, not in that session.

**Done:** everything the check marks Done: sign-up and log-in, tenant isolation, Spaces, the
public collection form with consent, the Inbox with moderation, the public Wall, the embeddable
widget, the purge script and health check, and the security and quality requirements except the
three items listed below.

**Partial**

- **FR-INB-06:** the rules are implemented and tested one request at a time. The branch for a row
  changed between read and write (`apps/api/src/modules/testimonials/testimonials.service.ts:129-133`)
  is not reached by any test, so there is no concurrency test.
- **SEC-07:** `TRUST_PROXY_HOPS` is implemented. HTTPS and HSTS are not set up, and the rate
  limiter is in memory, per process. The right hop count depends on the real deployment, which
  no test can check.

**Deferred**

- **NFR-07:** the SRS sets no latency, uptime or backup targets for the MVP (no production
  deployment yet).

**Not built** (outside the 69 IDs; reasons from "Known limitations" above and
`docs/decisions/`)

- HTTPS and deployment: only the optional increment I11 (`docs/BUILD_ORDER.md`), not started.
- Email verification and password reset: excluded from the MVP (`docs/requirements/PRD.md`). Sign-up also reveals whether an
  email is registered (accepted trade-off, ADR 0001).
- Roles, team invites: one owner per workspace; `OWNER` is the only role.
- CAPTCHA: spam defence is a honeypot, a per-IP rate limit and moderation (ADR 0005).
- Server-side rendering for SEO: the public pages are a single-page app.
- A shared rate limiter (for example across several processes): the limiters are in memory.
- Auditable consent text: only the template version is stored.

## Agentic workflow: tools used and where

Claims below rest on a path, a commit, a PR or a command output. Where only the owner's account
supports a claim, the text says "per the owner".

- **Subagent: `.claude/agents/security-reviewer.md`.** Read-only reviewer (tools: Read, Grep, Glob,
  Bash) for tenant isolation, data leaks, XSS, auth and secrets. It is required for every
  increment (`CLAUDE.md`, workflow step 4; `docs/BUILD_ORDER.md`). Its findings from the I02
  review are in `docs/decisions/0001-mvp-implementation-decisions.md` ("Follow-ups"), for example:
  - `/health` runs a database query on every request, so a rate limit could answer the Docker
    healthcheck with 429 (scheduled for I03).
  - Migrations run with the application's database credentials; a separate migrator role is
    still open (I11).
  - Expired `Session` rows were rejected on read but never deleted; fixed in I10 with the purge
    script (ADR 0005).

  The ADR says "I02 security review" and does not name the subagent. The PR descriptions of later
  changes do state that it ran: PR #7 (form limiter: "no blocking findings"), PR #8 (trust proxy:
  "no blocking findings") and PR #9 (Playwright MCP: "no critical, high or medium findings").
  PR #6 (hook) does not mention it.

- **Hook: `.claude/settings.json` and `.claude/hooks/guard-git-add.mjs`.** A `PreToolUse` hook on
  Bash that blocks `git add -A`, `.`, `-u` and `.env*` / `.docx` files. Its tests are in
  `.claude/hooks/guard-git-add.test.mjs` and run through `pnpm test:hooks` inside `pnpm verify`.
  Added in PR #6 (`a277889`). The documented limits are in `CLAUDE.md`.

- **MCP: `.mcp.json`.** Playwright MCP (`@playwright/mcp@0.0.83`, pinned, headless, isolated
  profile, origin allowlist), added in PR #9 (`3fc7de7`). It walked the demo script above and took
  the screenshots below; the results and deviations are in
  [`docs/demo-check.md`](docs/demo-check.md). `.claude/settings.json` denies
  `mcp__playwright__browser_run_code_unsafe`.

- **Parallel work.** Per the owner, two git worktrees and two Claude Code sessions built
  `feat/form-limiter` (PR #7) and `feat/trust-proxy` (PR #8) at the same time. PR #7 and PR #8
  both say they were built in a parallel worktree. The merge commit `4690941` resolved 7
  conflicting files (`.env.example`, `README.md`, `apps/api/src/app.ts`, `apps/api/src/config.ts`,
  `apps/api/test/helpers/test-config.ts`, `apps/api/test/unit/config.test.ts`,
  `docker-compose.yml`), as its message lists. Output of `git log --oneline --graph c81d9d7 -14`:

  ```text
  *   c81d9d7 Merge pull request #9 from isfak1537/chore/playwright-mcp
  |\
  | * 3fc7de7 chore(mcp): add Playwright MCP and demo walkthrough evidence
  |/
  *   0fba51b Merge pull request #8 from isfak1537/feat/trust-proxy
  |\
  | *   4690941 Merge remote-tracking branch 'origin/main' into feat/trust-proxy
  | |\
  | |/
  |/|
  * |   a6edb68 Merge pull request #7 from isfak1537/feat/form-limiter
  |\ \
  | * | da8b0e1 feat(security): per-IP rate limit on the public form GET
  |/ /
  | * edd2382 feat(security): configurable trust proxy hop count (TRUST_PROXY_HOPS)
  |/
  *   7439f2a Merge pull request #6 from isfak1537/chore/guard-hook
  |\
  | * a277889 chore(hooks): enforce explicit-path staging with a PreToolUse hook
  |/
  *   84dbb73 Merge pull request #5 from isfak1537/docs/model-and-check
  |\
  | * 41f23da docs: add data model and requirements check
  |/
  *   f1faed4 Merge pull request #4 from isfak1537/feat/mvp
  |\
  | * 4068045 docs(i10): make the README demo runnable from a fresh clone
  | * a978a17 feat(i10): hardening and docs
  ```

- **Workflow.** `CLAUDE.md` holds the rules and the per-increment loop (plan, implement, verify,
  review, owner approval; planning in plan mode). `docs/BUILD_ORDER.md` lists the increments
  I00-I10. Owner-approved decisions are the ADRs in `docs/decisions/` (0001-0005). CI is
  `.github/workflows/ci.yml` (verify, Playwright E2E, Docker image check).

- **Not used:** Claude Code skills (`.claude/skills/` is empty) and OpenSpec.

## Screenshots

Taken by the Playwright MCP walkthrough ([`docs/demo-check.md`](docs/demo-check.md)), which used
the slug `acme-demo` and fake data. Numbers are the steps of the demo script.

1. Sign up and create a Space

   ![Landing page](docs/screenshots/landing.png)
   Landing page.

   ![Sign-up form](docs/screenshots/signup.png)
   Sign-up form.

   ![Space created](docs/screenshots/space-created.png)
   The new Space "Acme Demo".

2. Collect

   ![Collection form](docs/screenshots/collection-form.png)
   The public collection form with the consent box.

   ![Thank you](docs/screenshots/thank-you.png)
   The confirmation after sending.

3. Review

   ![Inbox, pending](docs/screenshots/inbox-pending.png)
   The submission is Pending in the Inbox.

   ![Inbox, published](docs/screenshots/inbox-published.png)
   After Approve and Publish.

4. Wall

   ![Wall](docs/screenshots/wall.png)
   `/w/acme-demo` shows the published testimonial.

5. Widget

   ![Widget on another origin](docs/screenshots/widget-host-page.png)
   The widget on a page served from `localhost:8000`.

6. Unpublish

   ![Wall after unpublish](docs/screenshots/wall-after-unpublish.png)
   The Wall after Unpublish: "No testimonials yet."

7. Isolation

   ![Second user, empty](docs/screenshots/second-user-empty.png)
   A second user sees no Spaces.

## Project documents

- `docs/requirements-check.md`, `docs/data-model.md` and `docs/demo-check.md`: requirements
  check, data model and demo walkthrough evidence.
- `docs/requirements/PRD.md` and `SRS.md`: product and software requirements (v2).
- `docs/architecture/ARCHITECTURE.md`: where code goes and which rules it follows.
- `docs/BUILD_ORDER.md`: the increment plan (I00–I10).
- `CLAUDE.md`: instructions for Claude Code sessions.

The old Word drafts (`docs/requirements/*.docx`) are superseded, ignored by Git, and must not
be added.
