# 0003 — Public Wall decisions (I08)

| Field  | Value                              |
| ------ | ---------------------------------- |
| Status | Accepted by the owner, 31 Oct 2026 |
| Scope  | I08 public Wall                    |

## Context

FR-WALL-01..06 leave open where the "public" rule lives, how the cursor works, and how CORS
behaves on errors. These decisions close them. The SRS is updated in I08 to match.

## Decisions

1. **One rule.** `PUBLIC_WHERE` in `modules/testimonials/testimonials.repo.ts` is the only place
   the five conditions are written (approved, published, consent not withdrawn, not deleted,
   Space not archived). `listPublicTestimonials` spreads it with `workspaceId` and `spaceId`
   taken from the slug lookup. The widget (I09) and any future public read reuse it.
2. **Archived twice.** `findActiveSpaceBySlug` answers 404, and `PUBLIC_WHERE` also checks
   `space.archivedAt`, so a Space archived between the lookup and the item query shows nothing.
3. **Allowlist.** Item keys are exactly `id, authorName, authorTitle, rating, content,
publishedAt` (FR-WALL-03 lists `id`). The top level is `space{name, headline}`,
   `testimonials`, `nextCursor`. `id` is a testimonial id only; no Space id, slug, or workspace id.
4. **Cursor.** Keyset on `(publishedAt desc, id desc)`, same opaque encoding and validation as the
   Inbox cursor. It only positions the list; the tenant and Space filters come from the slug, so a
   cursor taken from another Space cannot return that Space's rows.
5. **Headers.** `Access-Control-Allow-Origin: *` and `Cache-Control: no-store` are set before the
   limiter, so 404, 422 and 429 carry them too. No credentials header, no `Vary: Origin`, no
   preflight handler (a plain GET needs none).
6. **Rate limit.** Own per-IP bucket, 60 s window, `WALL_RATE_LIMIT_MAX` (default 120).
7. **Slug lookup hardening.** `findActiveSpaceBySlug` returns "not found" for anything that
   cannot be a slug (`SLUG_PATTERN`) without querying. A `%00` slug previously reached Postgres and
   gave a 500 on both public endpoints.
8. **Dashboard.** The Wall tab only links to `/w/{slug}`; what appears is decided in the Inbox.

## Follow-ups

- **I09 (headers):** the existing security headers set no `Cross-Origin-Resource-Policy`, and
  `X-Frame-Options: DENY` / CSP `frame-ancestors 'none'` apply only to `text/html` responses, so
  `/embed/widget.v1.js` and the Wall JSON are embeddable today. If CORP `same-origin` is ever added
  to the global headers, `/embed/*` and the Wall route must override it with `cross-origin`, and
  I09 must add a test for that.
- **I09:** the widget fetches the Wall from the script's own origin; the CORS `*` header is for
  third-party pages that call the API directly.
- **I10:** the Wall limiter is per process and per IP, like the others; revisit with the proxy
  decision (`trust proxy`, ADR 0001).
