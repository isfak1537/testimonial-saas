# Product Requirements Document — Testimonial SaaS

| Field | Value |
|---|---|
| Version | 2.0 (replaces PRD.docx v1.0) |
| Date | 30 October 2026 |
| Owner | Project owner (final decisions) |
| Status | Approved baseline for the 24-hour MVP build |
| Related | `docs/requirements/SRS.md`, `docs/architecture/ARCHITECTURE.md`, `docs/BUILD_ORDER.md` |

> Why v2: v1.0 had a P0 scope larger than one person can build in 24 hours, and it
> contradicted the recorded engineering decisions (owner field, consent table, multiple
> forms per Space). v2 is the single source of truth. Where v1.0 and v2 disagree, v2 wins.

## 1. Summary

A multi-tenant web app where a business owner creates a **Space** (one per product or
brand), shares a public link, collects **text testimonials** with explicit consent,
reviews them in an **Inbox**, publishes the good ones to a public **Wall of Love**, and
embeds that Wall on any website with a **one-line widget**.

It is inspired by testimonial.to's core workflow. It does not copy their branding, copy
text, assets or proprietary implementation.

## 2. Problem

- Customer praise is scattered across email, chat and social media.
- Asking customers for testimonials manually is slow and awkward.
- Publishing a customer's words without a review step and clear consent is risky.
- Adding social proof to a website usually needs a developer.

## 3. Users

| Persona | Need | MVP actions |
|---|---|---|
| Owner (founder, freelancer, small team) | Collect and show credible proof with little setup | Sign up, create Space, share link, moderate, publish, copy embed code |
| Submitter (the owner's customer) | Leave feedback quickly on a phone, no account | Open link, write text, rate, consent, submit |
| Website visitor | See real testimonials | View the Wall page or the embedded widget |

Out of MVP: teams, agencies managing many clients, developers using an API.

## 4. Core journeys (MVP)

**A. Setup** — Sign up → a workspace is created automatically → create a Space (name,
slug, headline, message, prompt questions) → copy the collection link `/c/{slug}`.

**B. Submit** — Customer opens `/c/{slug}` → enters name, optional title/company,
optional email, rating 1–5, testimonial text → ticks the consent box → submits → sees a
thank-you screen. Nothing is public yet.

**C. Moderate and publish** — Owner opens the Inbox → filters by status → approves or
rejects → publishes approved items → can unpublish, delete, or record a consent
withdrawal at any time.

**D. Show** — Published testimonials appear on `/w/{slug}` and in the embedded widget.
Unpublishing, rejecting, deleting or withdrawing consent removes them on the next request.

## 5. Scope

### 5.1 MUST — the 24-hour MVP (build order I01–I08)

| ID | Feature | Outcome |
|---|---|---|
| PRD-01 | Account | Email + password sign up, log in, log out. One workspace auto-created per user. |
| PRD-02 | Spaces | Create, list, edit, archive Spaces. Unique, case-insensitive public slug. |
| PRD-03 | Collection page | Public form per Space (one form per Space). Mobile-first. |
| PRD-04 | Consent | Submitter must grant publication consent to submit. Version and time are stored. |
| PRD-05 | Inbox | List with status filter and pagination, detail view, approve, reject, delete. |
| PRD-06 | Publication | Publish / unpublish, separate from approval. Only approved + consented items can be published. |
| PRD-07 | Consent withdrawal | Owner records a withdrawal on the submitter's request; item leaves public view immediately and cannot be republished. |
| PRD-08 | Wall of Love | Public page `/w/{slug}` showing published testimonials, newest first. |

### 5.2 SHOULD — if time remains (I09–I10)

| ID | Feature | Outcome |
|---|---|---|
| PRD-09 | Embeddable widget | One snippet; masonry layout; light/dark theme; under 30 KB gzipped. |
| PRD-10 | Hardening | Golden-path E2E, security tests, purge script, docs. |

### 5.3 COULD — after the 24 hours (I11+)

Deployment to a public host, basic analytics (widget impressions/clicks, no cookies),
tags and search, featured flag and manual ordering, carousel layout, password reset,
email verification.

### 5.4 WON'T in this version

Video testimonials, social imports, email invitations, team members and roles other than
Owner, billing, custom domains, NPS, case studies, AI features, public developer API,
webhooks, microservices.

## 6. Product decisions (made by the mentor on 30 Oct 2026; owner may revise)

| # | Decision | Reason |
|---|---|---|
| D1 | Only the **Owner** role exists in the MVP. The membership table and role enum stay so roles can be added later. | No invite feature in MVP, so other roles could never be used. |
| D2 | **One workspace per user**, created at sign-up. The data model still allows many. | Removes a whole "workspace switcher" UI. |
| D3 | **One form per Space**; form settings live on the Space; slug lives on the Space. | Simpler model and URLs. |
| D4 | **Consent is required to submit.** Consent fields live on the testimonial. | Every stored testimonial is publishable in principle; no separate consent table to keep in sync. |
| D5 | **Moderation and publication are separate.** Approve first, then publish. | Lets the owner approve now and choose what to show later (v1.0 requirement kept). |
| D6 | **No Widget entity in MVP.** The widget shows a Space's Wall, configured by HTML attributes. | Saves a table, a CRUD screen and an endpoint. |
| D7 | **Text only.** No media storage, no Redis, no background workers. | Not needed without video or email. |
| D8 | **Soft delete** with 30-day retention and a manual purge script. | Recoverable mistakes; no cron in MVP. |
| D9 | Prompt questions on the form are **guidance only**; the customer writes one free-text answer. | Avoids storing and protecting separate custom answers. |
| D10 | The owner **cannot edit** a customer's name, rating or text. Only status changes. | Publishing words the customer did not write is a trust and consent problem. |

## 7. UX principles

- Public form: works on a phone, few required fields, clear errors, honest consent text.
- Dashboard: Spaces list → Space page with tabs **Inbox · Collection link · Wall · Embed · Settings**.
- Status is always visible: Pending / Approved / Rejected, and a separate **Public** badge.
- Empty states tell the owner the next step ("Share this link to get your first testimonial").
- Keyboard accessible, visible focus, labelled inputs.
- No dark patterns: consent box is never pre-ticked.

## 8. Success criteria for the MVP demo

The MVP is done when all of these are shown live on a local Docker stack:

1. A new user signs up and creates a Space.
2. From a private browser window, a visitor submits a testimonial with consent.
3. The owner sees it in the Inbox as Pending, approves it, and publishes it.
4. It appears on `/w/{slug}` (and in the widget, if I09 is done).
5. The owner unpublishes it; it disappears from the Wall on refresh.
6. A second user cannot see or change the first user's Space or testimonials (automated test).
7. `pnpm verify` and the E2E suite pass in CI.

Product metrics (activation, conversion, publication rate) are defined in v1.0 and are
deferred until analytics exists. No numeric targets are set.

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| 24 hours is not enough | High | Strict MUST/SHOULD/COULD cut line; demo after I08 is acceptable. |
| Cross-tenant data leak | Critical | Tenant-scoped repositories, composite foreign keys, negative tests in every increment. |
| Publishing without consent | High | Database CHECK constraint plus service rule plus tests. |
| XSS through testimonial text | High | Render as text only (React escaping, `textContent` in widget); tests with payloads. |
| Spam submissions | Medium | Rate limit + honeypot field. |
| AI agent claims work it did not do | Medium | Owner checks CI and runs the demo personally. |

## 10. Assumptions and open items

- Product name is temporary ("Testimonial SaaS", in `packages/shared/src/brand.ts`).
- Hosting provider is not chosen; deployment is a COULD item.
- Privacy policy and terms are not written; the app must not claim legal compliance.
- No password reset in MVP: a user who forgets a password must be reset manually in the database.
