# MODERATION M6 — MODERATOR UI

**Date:** 2026-08-04
**Authority:** [ADR-018](../../99-decisions/ADR-018-moderation-foundation.md) (Accepted), [moderation-design.md](../../data/modules/moderation-design.md) §9
**Status:** **PARTIALLY COMPLETE — DOCKER VERIFICATION REQUIRED**
**Repository:** `D:\Projects\PhuQuocHub` (branch `master`)

M6 delivers a minimal moderator operations frontend consuming the existing M2/M3/M4 backend
contracts. All Docker-independent work is complete and validated. Live browser validation and
backend e2e regression are **not yet run** because the Docker daemon was unavailable during
implementation.

---

## Route

| Route | Type | Purpose |
|---|---|---|
| `/dashboard/moderation` | queue | Case list with URL-driven filters + shared pagination |
| `/dashboard/moderation/[id]` | detail | Case metadata + reports + target preview + decision form |

Both live under the existing `(dashboard)` route group (client `RouteGuard` → authenticated only).
Server-component page shells export static `metadata` (dashboard `robots: noindex`); the interactive
content is client-side (needs the Bearer token from `localStorage`).

## Permissions / access

- Backend is authoritative: `GET /moderation/cases` and `GET /moderation/cases/{id}` require
  `Moderation.Queue.View`; `POST /moderation/cases/{id}/decide` is guarded in the service by the
  case's `target_type` (`Media.Moderate` for media, `Review.Moderate` for review).
- **No role-name guessing.** Access is permission-based at the backend only.
- **Navigation decision (documented limitation):** the frontend session (`AuthSession`) exposes **no
  permissions**, and `GET /users/me` returns no permission field. Per the approved fallback, the
  moderation link is **omitted from dashboard navigation**; the route stays reachable by direct URL,
  and the authoritative gate is the backend **403**, which the UI renders as a clear forbidden state
  (`Moderation.Queue.View` named). Enabling the nav link in future requires the backend/session to
  expose the caller's permissions (a `/users/me`-style capability), which is intentionally **not**
  added in M6.

## Filters

Exact M2 filters, URL-driven (shareable/bookmarkable), page reset to 1 on any change, unrelated
params preserved:

- `status` (default = queue: open + claimed), `target_type`, `source`, `severity`, `assigned_to` (UUID).
- **No client-side sort control** — backend ordering is fixed (priority DESC, report_count DESC,
  created_at ASC, id ASC).
- Shared `Pagination` component; `baseQuery` preserves filters across pages.
- Queue rows show only useful metadata (target type, source, status, severity, priority, report
  count, created time, assignment **status**) — **no reporter private data**, and the assignee UUID
  is not surfaced.

## Decision UX

- Allowed decisions are **derived** from `target_type` + current content status (`allowedDecisions`),
  mirroring the backend FSMs — **no invalid action is ever rendered**:
  - media pending → approve, reject · published → hide · hidden/rejected → restore
  - review pending → approve · published → hide · hidden → restore
- `reason` required for reject|hide (submit disabled until provided; backend remains authoritative).
- media `restore` requires an explicit `target_status` (published | pending); review restore has its
  single implicit destination (published).
- Duplicate submissions disabled; submitting state shown (`aria-busy`); success confirmation shown.
- **No optimistic mutation** — on success the case/list is re-fetched to reflect committed server
  state.
- Safe conflict handling: **409** → "case already handled by someone else, reload"; **422** → the
  backend's user-safe Vietnamese message; **403/404** → safe messages. Technical errors are never
  surfaced raw.
- `dismiss` (case-level) is supported by the backend `decide` endpoint but intentionally **not
  surfaced** in the M6 UI (Phase 6 enumerates content decisions only) — future enhancement.

## Target preview

- media: type, status, created time — and a **truthful "Không có ảnh xem trước"** state, because the
  API intentionally returns no preview URL for pending media (signed-URL deferred by design). No
  storage URL is reconstructed client-side; no storage endpoint added.
- review: rating, status, and the content quote.
- Never rendered: `object_key`, bucket, checksum, signed upload URLs, reporter email/name, audit
  internals, or fields not returned by the API.

## Accessibility

Semantic headings (`h1`/`h2`), labels associated with every control, decision radios with accessible
names, `role="alert"` on errors + `role="status"` on success, `aria-busy` during loading/submission,
visible keyboard focus, and status conveyed by **text** (badges always carry a label; color is only a
secondary cue). No WCAG certification is claimed.

## Tests (Docker-independent — all PASS)

| Suite | Coverage |
|---|---|
| `decisions.spec.ts` | decision matrix per target type/status; required reason; media restore target; empty cases |
| `api/moderation.api.spec.ts` | list query generation, detail path (encoded id), decide POST, param inclusion |
| `ModerationFilters.spec.tsx` | init from URL, page reset, param preservation, clear, assigned_to |
| `ModerationQueueRow.spec.tsx` | metadata render, detail link, assignment status, no assignee UUID leak |
| `ModerationDecisionForm.spec.tsx` | valid actions by status, required reason, restore target, duplicate-submit block, success, 409/422 handling, no invalid action, resolved case |
| `ModerationQueueView.spec.tsx` | renders cases, empty, 403 forbidden, error+retry, no reporter data |
| `http.spec.ts` (pre-existing) | `apiGetAuth` / `apiGetPaginatedAuth` Bearer + envelope/error |

Results: **37 moderation component tests PASS**; full frontend suite **234 tests × 2 consecutive
runs PASS**; monorepo **typecheck 6/6**, **lint clean**, **build 4/4** (routes `/dashboard/moderation`
+ `[id]`); backend **unit 1115 PASS** (no backend change). `git diff --check` clean; secret scan
clean.

## Live browser evidence

**PENDING — Docker daemon unavailable at implementation time.** The following remain to be executed
against the real local Docker stack and must be completed before M6 is declared done:

- seed disposable cases (pending/published media, published/hidden review, varied severity/report count)
- member login → verify backend + UI **403** denied
- moderator login → queue loads, filters + pagination work, case detail opens
- perform media approve / media hide / media restore (explicit target) / review hide / review restore
- verify UI refreshes to committed server state; place `rating_avg`/`rating_count` change on review
  visibility changes; no console errors
- verify stale/invalid transition → safe **409/422** conflict message
- clean up all disposable fixtures
- full backend **e2e** regression

## Pre-existing uncommitted-file handling

`apps/web/src/lib/http.ts` and `http.spec.ts` arrived already modified (uncommitted) — valid
in-progress M6 work adding `apiGetAuth` / `apiGetPaginatedAuth` (Bearer GET, paginated) with tests
covering the Bearer header, data/meta unwrap, and 401/403. They are **necessary** (the moderation API
client uses both) and **correctly tested**; retained as-is, not overwritten.

## Remaining work for M7 (NOT started)

AI Shadow Mode and everything explicitly out of M6 scope: AI moderation, sanctions, appeals,
notifications, analytics/SLA dashboards, bulk decisions, keyboard shortcuts, real-time/websocket
updates, media editing, and any moderation link in dashboard nav (blocked on FE permission exposure).
