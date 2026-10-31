# 0004 — Embeddable widget decisions (I09)

| Field  | Value                              |
| ------ | ---------------------------------- |
| Status | Accepted by the owner, 31 Oct 2026 |
| Scope  | I09 widget, `/embed/*`, Embed tab  |

## Decisions

1. **Isolation.** One open Shadow root per container. The root element inside it sets
   `all: initial` and its own font, colour and background, so inherited host rules (for example
   `* { color: red !important }` matching the host element) stop there. A host rule that hides
   the container itself (`display: none`) is the host's choice and is not defended.
2. **Styles and CSP.** Styles are attached as a constructed stylesheet (`adoptedStyleSheets`),
   with a `<style>` fallback for old browsers. An inline `<style>` would be blocked by the
   dashboard's own CSP (`default-src 'self'`) and by strict host pages.
3. **Rendering.** Every API string goes through `textContent`. A unit test fails if the widget
   source contains an HTML-parsing API. The response is untrusted: only the allowlisted keys are
   kept, types are checked, and the rating is clamped to 1–5.
4. **Mounting.** The script origin is captured synchronously. If the document is still loading,
   scanning waits for `DOMContentLoaded`. A container that already has a shadow root, or is in
   the in-script `WeakSet`, is skipped, so two script tags or two containers render each once.
5. **Failure.** Any error leaves an empty container and no `console` output. A 404 (unknown or
   archived Space) is treated the same. The browser itself may still log a failed network request.
6. **One page.** The widget requests `limit = data-limit` once; there is no "load more".
   The Space name and headline are not shown.
7. **No shared import.** The widget has its own small types; it does not depend on
   `packages/shared`, not even for types.
8. **CORP.** `/embed/*` and the Wall route send `Cross-Origin-Resource-Policy: cross-origin`
   (ADR 0003 follow-up) and tests pin it. `/embed/*` keeps `public, max-age=300`.
9. **Embed tab.** The snippet uses `window.location.origin`, as the Collection link does. The
   preview mounts the real script in the dashboard page.

10. **Accepted trade-off.** Each container makes its own Wall request (per-IP limiter, 120 per
    minute by default). A page with very many containers, or many visitors behind one NAT, can get
    429 and then shows nothing (decision 5). Sharing one request per slug is deferred.
11. `/embed/*` also sends `Access-Control-Allow-Origin: *`, so `<script crossorigin>` works.

## Follow-ups

- **I10:** the widget script is cached for 5 minutes with no versioned URL; a breaking change
  needs a new file name (`widget.v2.js`), not an edit.
