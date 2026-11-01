# Demo check (Playwright MCP)

Status: **walkthrough run, steps 1-7 PASS** (with the deviations listed below).

Tool: `@playwright/mcp@0.0.83` (Microsoft), headless, isolated profile, 1280x800 viewport, limited by `--allowed-origins` to `http://localhost:3000` and `http://localhost:8000` (not a security boundary). See the "Playwright MCP" section in `CLAUDE.md`.

Run date: 2026-11-01 · Stack: `docker compose up -d --build --wait` · Widget host page: `python3 -m http.server 8000` from a folder outside the repo.

Fake data only: `alice.demo@example.com`, `bob.demo@example.com`, `demo.visitor@example.com`, throwaway passwords (not recorded).

## Deviations from the README demo script

- **Slug `acme-demo` instead of `acme`.** `acme` was already taken in the persistent dev database (API answered 409 "Already in use" on the first attempt, so step 1 was retried once with a different slug). Nothing was deleted and no `down -v` was used. The widget host page used `data-space="acme-demo"`.
- **No real private window (step 2).** The browser was closed so the in-memory profile was fresh, then the public form was opened without a session.

## Results

| Step | Description                      | Result | What I saw                                                                                                                                  | Screenshot                           |
| ---- | -------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1    | Sign up and create a Space       | PASS   | Signed up as Alice, landed on `/app`. Space "Acme Demo" created with slug `acme-demo` (second attempt, see above).                          | `landing`, `signup`, `space-created` |
| 2    | Collect: submit the public form  | PASS   | `/c/acme-demo` in a fresh profile. Form filled with consent, submitted once. "Thank you!" shown.                                            | `collection-form`, `thank-you`       |
| 3    | Review: approve and publish      | PASS   | Logged in again. Inbox showed the item as pending, then approved, then approved + published.                                                | `inbox-pending`, `inbox-published`   |
| 4    | Wall `/w/<slug>`                 | PASS   | `/w/acme-demo` showed the published testimonial from "Demo Visitor".                                                                        | `wall`                               |
| 5    | Widget on a different origin     | PASS   | `http://localhost:8000` (widget script from `:3000`) rendered the same testimonial.                                                         | `widget-host-page`                   |
| 6    | Unpublish, wall no longer shows  | PASS   | After Unpublish in the Inbox, `/w/acme-demo` showed "No testimonials yet."                                                                  | `wall-after-unpublish`               |
| 7    | Isolation: second user sees none | PASS   | Fresh profile, signed up as Bob: "You have no Spaces yet." Opening Alice's Space URL gave "Space not found" (API 404). No screenshot of it. | `second-user-empty`                  |

## Network origins check

`browser_network_requests` (static resources included) was called once, at the end, on Bob's last page. It lists only requests to `http://localhost:3000` (page, `/assets/*`, `/api/v1/*`). No other origin appeared.

Limit: the tool lists requests since the last page load, so earlier pages (including the widget host page on `:8000`) were not covered by that call. No navigation left the two allowed origins.

## What the MCP could not do

- No real private window and no switching between profiles: a fresh profile was obtained by closing the browser (in-memory profile).
- `browser_network_requests` only covers the current page load, so it is not a whole-session audit.
- Snapshots are sometimes empty right after a navigation, so a wait for visible text was needed before reading the page.
- `--allowed-origins` is not a security boundary and does not cover redirects.
- `npx -y` in `.mcp.json` has no integrity check beyond the pinned version (`@playwright/mcp@0.0.83`).
- `browser_evaluate` and `browser_file_upload` remain allowed; only `browser_run_code_unsafe` is denied.
