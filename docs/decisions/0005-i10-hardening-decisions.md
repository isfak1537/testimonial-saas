# 0005 — Hardening decisions (I10)

| Field  | Value                               |
| ------ | ----------------------------------- |
| Status | Accepted by the owner, 31 Oct 2026  |
| Scope  | I10 purge, sessions, honeypot, docs |

## Decisions

1. **One purge command.** `purge:deleted` removes testimonials whose `deletedAt` is strictly
   older than 30 days (exactly 30 days is kept) and sessions whose `expiresAt` has passed. It
   prints the database name (no host or credentials) and both counts before changing anything,
   in dry-run and `--confirm`. Any other argument is an error. Audit rows are kept (no PII).
   It runs from the compiled output (`node dist/scripts/purge-deleted.js`); no new dependency.
2. **Sign-up replaces a held session**, like log-in, but only once the account exists: a
   rejected sign-up (409, 422) leaves the caller's session alone.
3. **Honeypot renamed** from `website` to `leaveBlank`, because browsers and password managers
   autofill fields named like `website`, `url`, `company`, `phone`, `address`, `email` or `name`,
   which silently dropped a real visitor's submission. The input keeps `autocomplete="off"`,
   `tabIndex={-1}` and `aria-hidden`. The old `website` key is now an unknown key (422). A
   time-to-submit check is not added: a client-supplied timing is trivial to forge and would
   silently drop fast real visitors.
4. **Widget versioning rule.** `/embed/widget.v1.js` is cached for 5 minutes. A change that
   breaks existing embeds ships as a new file (`widget.v2.js`), never as an edit of `v1`.
5. **Landing page.** The development banner is removed and the three cards that described
   backlog features (tags/search, carousel, team roles) now describe the MVP.

## Deferred (not in I10)

- Stronger spam defence (CAPTCHA/PoW, per-Space limits, email verification, moderation hints):
  needs a PRD update. Honeypot, per-IP limiter and moderation remain the MVP defence.
- Wall limiter per process and IP, `GET /form` having no limiter, HSTS, `trust proxy`, migrator
  database role: I11 (deployment), listed in its acceptance criteria.
- The I08 guard-drop test can leave the publish guard dropped in the test database if the
  process is killed mid-test. Documented only; re-run `pnpm db:test:up` with a fresh volume.
- Consent text is not reproducible after a Space rename (schema change).

## Consequences

- SRS FR-AUTH-06, FR-COL-02, FR-COL-04 and FR-OPS-01 are updated to match.

## Update (1 Nov 2026)

- The `GET /form` limiter listed under Deferred was added in a separate change: `FORM_RATE_LIMIT_MAX`
  (default 60 per IP per minute, a judgment, not measured). SRS FR-COL-07 was updated. The
  deferred list above is left as originally accepted.
