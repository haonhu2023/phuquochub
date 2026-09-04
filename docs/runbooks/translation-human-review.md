# Runbook — Human Translation Review

> Operational guide for reviewing pending place translations. Policy/architecture lives in
> [ADR-021](../99-decisions/ADR-021-human-translation-review.md); this doc is the "how do I use it" companion.

## How a reviewer gets access

1. The reviewer must be a **real, active, non-service-account** user (`users.is_active=true`,
   `users.is_service_account=false`).
2. An operator grants them the `moderator` role (or `administrator`/`super_administrator`, which
   inherit it) — via the existing role-assignment path (`Role.Assign` permission /
   `npm run operator:bootstrap` for the very first operator in a fresh environment). This is a
   deliberate, explicit action; nothing in this system auto-grants review access to anyone.
3. No separate "translation reviewer" role exists — reviewing a translation is treated as content
   moderation, the same capability class as the existing moderation queue.

## Opening the queue

Go to **Dashboard → Duyệt bản dịch** (`/dashboard/translations/review`). The link only appears for
an account whose `GET /users/me` roles include `moderator`/`administrator`/`super_administrator`
(pure UX — see `capabilities.ts`). Typing the URL directly with an unauthorized account shows a
clear "no permission" screen; the backend is the real gate either way.

Optional filters (URL-synced, shareable): địa điểm (slug), ngôn ngữ, loại nội dung.

## Reviewing an item

Click a card to expand it. You'll see:

- **Đang công khai (hiện tại)** — the text currently live for that exact place/field/language slot,
  or a note that nothing has been published there yet.
- **Đề xuất (đang chờ duyệt)** — the proposed text.
- **Nguồn** — the source URL/title/reliability backing the proposed text, if one is recorded. The
  link always opens in a new tab.
- Metadata: translation method, content revision id, quality gate.

Then choose one:

- **Duyệt (Approve)** — the text becomes public immediately. Notes are optional.
- **Cần sửa lại (Needs changes)** — stays private; notes are **required** and should say exactly
  what to fix.
- **Từ chối (Reject)** — stays private; notes are **required** and should say why.

Notes are capped at 200 characters (enforced both in the form and by the server).

## What happens after you decide

- The decision, your account id, and the exact timestamp are written to an immutable audit row
  (`wiki_revisions`, `reviewed_by`/`reviewed_at`) — this cannot be spoofed from the browser; the
  server always uses your authenticated session, never anything sent in the request body.
- The item disappears from the queue (it's no longer PENDING/NEEDS_CHANGES).
- If someone else already decided it, or the text was edited, since you opened it, you'll see a
  clear "this changed, please refresh" message instead of your decision silently applying to the
  wrong version — reload the queue and re-check before deciding again.

## Editing invalidates approval — always

If a translation is edited after being approved (a new import run, a correction), the edit creates
a **new** row that starts back at "chờ duyệt" (PENDING) automatically. The old approved text stays
in history, untouched, but it no longer governs what's public — the new text does, and it needs its
own review before it can go live. There is no way to bypass this.

## What the importer can and cannot do

The multilingual importer can create new translation content (as PENDING, never public). It cannot
mark anything approved, publish anything, or otherwise skip this workflow — that gate was removed
specifically so it stops being possible.

## Glossary — what "publication eligible" means

A translation is only ever public when **all** of these are true, and they can only ever be set
together, by a real approval:

| Field | Meaning |
|---|---|
| `human_review_status = APPROVED` | A real person made this exact decision |
| `is_public = true` | Eligible to be served by the public API |
| `is_production_data = true` | Not a draft/staging row |
| `production_eligible = true` | Cleared every governance gate |

You will not normally need to look at these directly — the UI only ever shows you "Chờ duyệt / Cần
sửa lại / Đã duyệt / Đã từ chối", which is derived from them.
