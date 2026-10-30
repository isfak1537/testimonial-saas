# 0002 — Inbox and moderation decisions (I07)

| Field  | Value                              |
| ------ | ---------------------------------- |
| Status | Accepted by the owner, 30 Oct 2026 |
| Scope  | I07 inbox, moderation, audit       |

## Context

FR-INB-01..10 leave several cases open: archived Spaces, withdrawn items, repeated calls, and
what the list may show. These decisions close them. The SRS is updated in I07 to match.

## Decisions

1. **State model.** Moderation status, publication (`publishedAt`), consent withdrawal and soft
   delete are independent columns. The service holds the transition table (`decide`); each
   transition is a conditional `updateMany`, so races end as 409, never as a row the database
   publish guard refuses. The guard stays as the last line of defence.
2. **Archived Space.** List and detail work. Approve, reject, publish and unpublish return
   409 `INVALID_STATE` (archived is read-only, ADR 0001). Withdraw-consent and delete still work,
   because they are privacy actions.
3. **Withdrawn items.** Cannot be approved or published (409). Reject, unpublish and delete are allowed.
4. **Repeated calls.** Approving an approved item, publishing a published one, and so on are 200
   no-ops. Withdraw-consent twice is a 200 that keeps the first timestamp.
5. **Deleted items** are invisible: detail and all actions give 404 (not idempotent).
6. **Audit.** One row per effective change, written in the same transaction. A no-op or a 409
   writes none. `metadata` is `{spaceId, from, to}`; no email, name or text.
7. **List vs detail.** List items omit `authorEmail`; only the detail has it.
8. **Action bodies** are an empty strict object; any key gives 422 (FR-TEN-03).
9. **UI.** After creating a Space the owner lands on Settings; opening a Space lands on Inbox.

## Consequences

- A database `CHECK` violation is not mapped to a specific error: the conditional updates keep the
  service from reaching it, and an unexpected one stays a 500 rather than hiding a bug.
