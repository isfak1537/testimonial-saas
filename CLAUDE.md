# CLAUDE.md — Testimonial SaaS

Read at the start of every session. Keep this file short; details live in `docs/`.
The repository is PUBLIC: never write secrets, personal data or private notes here.

## Sources of truth (read before planning)

| File                                | Use it for                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `docs/BUILD_ORDER.md`               | Which increment is next, its scope and acceptance criteria. Never invent scope. |
| `docs/requirements/SRS.md`          | Exact behaviour, data model, API, security rules (requirement IDs).             |
| `docs/requirements/PRD.md`          | Product scope and decisions D1–D10.                                             |
| `docs/architecture/ARCHITECTURE.md` | Where code goes, layer rules, tenant isolation pattern.                         |
| `docs/decisions/`                   | Owner-approved implementation decisions (ADRs); they refine the SRS.            |

If these files disagree with each other or with the code, stop and ask the owner.
The old `PRD.docx` / `SRS.docx` are superseded; ignore them.

## Stack and layout

pnpm workspaces · TypeScript strict · Node 24 · pnpm 12 (corepack)

- `apps/api` — Express 5, Prisma 7 + PostgreSQL 16, Zod 4, pino, argon2, express-rate-limit. Also serves the built web app and `/embed/*`.
- `apps/web` — React 19 + Vite + react-router. Routes in `src/App.tsx` (keep `SPA_ROUTES` in `apps/api/src/app.ts` in sync).
- `packages/shared` — Zod contracts, consent text, brand name. Used by api and web.
- `packages/widget` — vanilla TS embed loader, Shadow DOM, built to `widget.v1.js`.
- `e2e/` — Playwright.

## Commands

| Command                                                   | Purpose                                                                                            |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                             | lint, format check, build, typecheck, unit tests, widget size. **Run before every report.**        |
| `pnpm test:api -- <pattern>`                              | API tests                                                                                          |
| `pnpm db:test:up`                                         | start throwaway test Postgres (port 54330)                                                         |
| `pnpm test:e2e -- <spec>`                                 | Playwright against http://localhost:3000                                                           |
| `docker compose up -d --build --wait`                     | full local stack (db + api on :3000)                                                               |
| `pnpm -F @testimonial-saas/web dev`                       | web with hot reload (proxies /api, /embed)                                                         |
| `pnpm format`                                             | Prettier write                                                                                     |
| `pnpm -F @testimonial-saas/api purge:deleted [--confirm]` | Purge old soft-deleted testimonials and expired sessions (dry-run default; run `pnpm build` first) |

## Workflow (every increment)

Plan → Implement → Verify → Review → Owner approval.

1. Plan in plan mode: files, data/API changes, tests (incl. cross-tenant), open questions. Wait for approval.
2. Implement only the approved scope. No drive-by refactors, no new dependencies without approval.
3. Run targeted tests, then `pnpm verify`. Fix failures before reporting.
4. Run the `security-reviewer` subagent on the diff; fix or report its findings.
5. Report (format below). Never claim a command ran or passed unless it did.
6. Subagents only for tasks with non-overlapping files; the main session integrates and re-verifies.

## Non-negotiable rules

- **Tenant isolation:** tenant repos take `workspaceId` and use it in every `where`. Not a member / wrong tenant → 404. Never trust IDs or status fields from request bodies. Every tenant endpoint gets a cross-tenant test.
- **Tenant routes:** every route under `/api/v1/workspaces/:workspaceId` mounts on the shared `tenant` router in `app.ts` (`requireSession` → `requireMember`); never mount a tenant route elsewhere.
- **Publication:** public = approved AND published AND consent not withdrawn AND not deleted AND Space not archived. Public JSON only via allowlist mappers.
- **Owner** = `WorkspaceMember.role = OWNER`. No owner column on Workspace. Consent fields live on Testimonial.
- **User text is text:** no `dangerouslySetInnerHTML`; widget uses `textContent` only.
- **Errors:** services throw `AppError`; the handler builds the envelope. No stack traces in responses.
- **Never** log passwords, tokens, cookies or `authorEmail`. Never claim legal compliance.
- Widget < 30 KB gzipped; no runtime imports from `packages/shared` in the widget.

## Git rules

- No commit, push, PR, merge, history rewrite or deploy without the owner's explicit approval in this conversation. "commit and push approved" covers both; PR/merge need their own approval.
- Before committing: check branch, `git status`, full diff, staged files; scan for secrets and `.env`/`.docx` files.
- Stage explicit paths only. Never `git add .` or `git add -A`.
- Commit message: `feat(i0X): <summary>` referencing SRS IDs in the body.

## Hooks

`.claude/settings.json` registers a `PreToolUse` hook on Bash (`.claude/hooks/guard-git-add.mjs`). It blocks `git add` (or `git stage`) with `-A`, `--all`, `-u`, `--update` or `.`, and of any file whose name starts with `.env` (except `.env.example`) or ends in `.docx`. The reason is shown so you can retry with explicit paths. It enforces the Git rules above; it does not replace them.

- Guardrail, not a security boundary. Known limits: `git commit -a` / `-am` and `git add -p` bypass the explicit-paths rule (not blocked); variable expansion, aliases, `bash -c`, globs (`git add *`, `.env*`), other spellings of "everything" (`..`, `$PWD`, `:/`, `--pathspec-from-file`, a whole directory) and unusual quoting/heredocs are not inspected. It fails open on any error.
- Test: `pnpm test:hooks` (also part of `pnpm verify`). See it fire: `/hooks`, or the Ctrl+O transcript.
- Turn off: set `"disableAllHooks": true` in a settings file (this disables all hooks), or for one run `claude --settings '{"disableAllHooks": true}'`.

## Playwright MCP

Project-scoped MCP server (`.mcp.json`, `@playwright/mcp@0.0.83` by Microsoft, pinned) that drives a headless browser to walk the README demo script and take screenshots. Results: `docs/demo-check.md`, images in `docs/screenshots/`.

- Start: needs the local stack up. Exit and restart `claude` in the repo after `.mcp.json` changes, approve the `playwright` server at the prompt, check `/mcp`. Reset the approval with `claude mcp reset-project-choices`.
- Scope: `--allowed-origins` limits requests to `http://localhost:3000` and `http://localhost:8000`. It is **not a security boundary** (it does not affect redirects). Mitigations: `--isolated` in-memory profile, headless, no extension, no opt-in `--caps`, `mcp__playwright__browser_run_code_unsafe` denied in `.claude/settings.json`.
- Use fake data only (`example.com` emails, a throwaway password). Visit only the two origins. Only the named PNGs under `docs/screenshots/` are kept; delete other MCP output and any `.playwright-mcp/` folder.

## Completion report

1. Increment ID and goal
2. Files created / modified / deleted
3. Key decisions (and any deviation from the docs, with reason)
4. Commands run with exact results
5. Security/privacy notes (incl. security-reviewer findings)
6. Acceptance criteria from BUILD_ORDER: passed / failed / unverified
7. Risks and follow-ups
8. Git status (and SHA if commit was approved); whether push/PR/merge happened
