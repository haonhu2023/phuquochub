# MODERATION M6 — MODERATOR UI

**Date:** 2026-08-04
**Authority:** [ADR-018](../../99-decisions/ADR-018-moderation-foundation.md) (Accepted), [moderation-design.md](../../data/modules/moderation-design.md) §9
**Status:** **COMPLETE**
**Repository:** `D:\Projects\PhuQuocHub` (branch `master`)

M6 delivers a minimal moderator operations frontend consuming the existing M2/M3/M4 backend
contracts. All work is complete and validated, including live validation against the real Docker
stack (Postgres/Redis/MinIO), a real running API + Web server, and a real browser session — see
[Live browser validation](#live-browser-validation-2026-08-04--complete) below.

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

Results: **37 moderation component tests PASS**; full frontend suite **234/234 PASS**.

## Live browser validation (2026-08-04 — COMPLETE)

Docker Desktop was started, containers confirmed healthy (`phuquoc-postgres`, `phuquoc-redis`,
`phuquoc-minio`), `npm run migration:run` confirmed **no pending migrations** (moderation migrations
already applied), working tree confirmed clean. Real API (`npm run dev`, port 4000) and Web
(`npm run dev`, port 3000) servers were started; validation ran against a real browser session.

**Fixtures:** 4 real users registered via `/api/auth/register` (member, moderator, administrator,
super_administrator), roles granted via direct SQL (`INSERT INTO user_roles ...`, matching the
repo's own e2e fixture convention) — administrator/super_administrator received **no explicit
moderation permission grants**, relying entirely on `role_parents` DAG inheritance. One disposable
place, 5 media rows, 3 review rows, 1 report, and 27 moderation cases (5 pointing at real fixtures +
22 with varied status/target_type/source/severity/assigned_to for genuine filter/pagination
coverage) were created directly in Postgres.

### A. Authorization matrix (live HTTP against `GET /api/moderation/cases`)

| Caller | Result |
|---|---|
| anonymous | **401** |
| member | **403** |
| moderator | **200** |
| administrator (inherited via `role_parents` DAG, no explicit grant) | **200** |
| super_administrator (inherited via `role_parents` DAG, no explicit grant) | **200** |

### B. Queue

- **Pagination:** 38 total cases (27 fixture + 11 pre-existing unrelated), 2 pages; item order on
  both pages verified to **exactly match** the raw API response order (priority DESC → report_count
  DESC → created_at ASC → id ASC tie-break), confirming the UI does not re-sort client-side.
- **Every filter individually** and **combined filters** (`target_type=media&severity=critical` → 6
  results, all correctly "Hình ảnh / Mức Nghiêm trọng") verified against exact expected counts.
- **Empty state:** `target_type=place` → "Hàng chờ trống" rendered correctly.
- **Retry state:** API process killed mid-session → real `ERR_CONNECTION_REFUSED` → safe error UI
  shown (no raw error leaked, no console crash) → API restarted → clicking **Thử lại** recovered the
  full 38-case queue.
- **Forbidden state:** logged in as the real member account, direct navigation to
  `/dashboard/moderation` → confirmed **no nav link** exists anywhere on the dashboard for this user
  → direct URL access → network tab confirmed real backend **403** → UI rendered the forbidden state
  naming `Moderation.Queue.View`.

### C. Detail

Verified for both media and review targets: full metadata block, reports list (no reporter identity
ever rendered), target preview. Media preview showed the **truthful "Không có ảnh xem trước"** state
exactly as designed (no signed URL, no reconstructed storage URL). Review preview showed rating,
status, and the review's text content correctly.

### D. Media decisions — all 4 transitions verified live

| Transition | Method | Result |
|---|---|---|
| `pending → published` (approve) | UI | confirmed via UI + direct DB query |
| `pending → rejected` (reject) | API | reason-required 422 confirmed, then success confirmed |
| `published → hidden` (hide) | UI | reason required (submit blocked with empty reason, confirmed live), attached report auto-transitioned to **"Chấp nhận" (upheld)** |
| `hidden → published` (restore, explicit target) | API | 422 without `target_status` (INV-10) confirmed first, then success |
| `hidden → pending` (restore, explicit **non-default** target) | UI | explicitly selected "Đưa lại hàng chờ duyệt" (not the default) — confirmed it genuinely took effect, not just always defaulting to published |
| invalid transition (e.g., approve on hidden media) | API | **422** `"Không thể duyệt media: media đã bị ẩn."` |

### E. Review decisions — all 3 transitions verified live, with exact rating math

| Step | Action | rating_avg / rating_count |
|---|---|---|
| baseline | 1 published review (4★) | 4.0 / 1 |
| hide (UI) | published → hidden | **NULL / 0** |
| restore (UI) | hidden → published (5★ review) | **5.0 / 1** |
| legacy approve (UI) | pending → published (3★ review) | **4.0 / 2** |

Every value matched the expected arithmetic exactly, confirmed via direct `SELECT rating_avg,
rating_count FROM places` after each UI action.

### F. Conflict (409) — genuine race, not simulated

A case was loaded in the browser (form rendered, "Duyệt" selected), then resolved **out-of-band via
a separate API call** (simulating a second moderator) while the form was still open. Submitting the
now-stale UI form produced: *"Case đã được người khác xử lý trong lúc bạn thao tác. Vui lòng tải lại
để xem trạng thái mới nhất."* DB confirmed **no double mutation** — the case and media reflected only
the first (out-of-band) decision.

### G. Rollback — transaction atomicity proven against the real Postgres transaction manager

A new permanent regression spec,
[`apps/api/test/moderation-decide-rollback.e2e-spec.ts`](../../../apps/api/test/moderation-decide-rollback.e2e-spec.ts),
uses a Nest DI spy (no production code modified) to make `ReportsRepository.resolveByCaseId` throw
**after** `media.status` and `moderation_cases.status` are updated inside the transaction but
**before** commit. Result: the whole transaction rolled back — `media.status` remained `pending`,
`moderation_cases.status` remained `open` with `decision`/`resolved_at` still `NULL`. A follow-up
call with the spy removed succeeded normally, confirming the case wasn't left "stuck." Test passes
in the full e2e run.

### H. Cleanup — zero residue confirmed

All disposable fixtures removed in FK-safe order (reports → moderation_cases → media → reviews →
user_roles → users → place). Post-cleanup checks confirmed: moderation queue count returned to the
pre-existing baseline of 11 (unrelated, out-of-scope historical cases, untouched), zero rows matching
any `m6-live`/`rollback` tag remained in `media`, `reviews`, `places`, or `users`.

## Full regression (2026-08-04)

| Check | Result |
|---|---|
| Backend unit | **98 suites / 1115 tests PASS** |
| Backend e2e (all 19 suites, real Postgres/Redis) | **19 suites / 163 tests PASS** (includes the new rollback spec) |
| Frontend tests | **38 suites / 234 tests PASS** |
| Frontend build | PASS — routes `/dashboard/moderation` (○) and `/dashboard/moderation/[id]` (ƒ) confirmed in output |
| Backend build | PASS (exit 0) |
| Monorepo build | **4/4 PASS** |
| Monorepo lint | **6/6 PASS**, clean |
| Monorepo typecheck | **6/6 PASS** |
| `git diff --check` | clean |
| Secret scan | clean (only the repo's conventional literal test password `'password123'`, matching every sibling e2e spec, disposable accounts only) |

## Pre-existing uncommitted-file handling

`apps/web/src/lib/http.ts` and `http.spec.ts` arrived already modified (uncommitted) — valid
in-progress M6 work adding `apiGetAuth` / `apiGetPaginatedAuth` (Bearer GET, paginated) with tests
covering the Bearer header, data/meta unwrap, and 401/403. They are **necessary** (the moderation API
client uses both) and **correctly tested**; retained as-is, not overwritten.

## Remaining work for M7 (NOT started)

AI Shadow Mode and everything explicitly out of M6 scope: AI moderation, sanctions, appeals,
notifications, analytics/SLA dashboards, bulk decisions, keyboard shortcuts, real-time/websocket
updates, media editing, and any moderation link in dashboard nav (blocked on FE permission exposure).
