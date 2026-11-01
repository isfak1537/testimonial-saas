# Testimonial SaaS

> "Testimonial SaaS" is a temporary working name, defined once in
> `packages/shared/src/brand.ts`.

A multi-tenant app for collecting customer testimonials, reviewing them before they go
public, and publishing approved ones on a public Wall and an embeddable widget. It is built
incrementally as a student project; this branch contains the MVP (increments I00–I10).
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

## Project documents

- `docs/requirements/PRD.md` and `SRS.md`: product and software requirements (v2).
- `docs/architecture/ARCHITECTURE.md`: where code goes and which rules it follows.
- `docs/BUILD_ORDER.md`: the increment plan (I00–I10).
- `CLAUDE.md`: instructions for Claude Code sessions.

The old Word drafts (`docs/requirements/*.docx`) are superseded, ignored by Git, and must not
be added.
