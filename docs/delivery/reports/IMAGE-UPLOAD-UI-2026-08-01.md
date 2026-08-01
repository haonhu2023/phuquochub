# IMAGE UPLOAD UI REPORT

**Date:** 2026-08-01
**Milestone:** Image Upload UI, strictly bounded scope, per Owner-approved execution plan following
re-evaluation of a previously-blocked candidate. Single-file upload only, integrated into exactly
one existing page (the review submission form), reusing the pre-existing orphan-media +
`attachToReview()` backend path from the Reviews milestone.

## 1. Phase 0 — Browser CORS verification

**Verified live, using a real browser (not Node `fetch`).** Started the `api` (port 4000) and `web`
(port 3000) dev servers via the Browser pane's `preview_start`, registered a throwaway test user
(`cors-smoke-test@example.com`), and — from the `http://localhost:3000` page origin, using
`javascript_tool` to execute real `fetch()` calls in the browser's own JS context — ran the full
presign → PUT → register sequence:

| Step | Result |
|---|---|
| `POST /media/presign` | `201 Created` |
| `OPTIONS http://localhost:9000/...` (CORS preflight on the MinIO PUT) | `204 No Content` |
| `PUT http://localhost:9000/...` (direct browser PUT to the presigned URL) | `200 OK` |
| `POST /media` (register) | `201 Created`, server-side checksum re-verification against the real MinIO object succeeded |

**No CORS block occurred.** The current dev MinIO configuration (`docker-compose.yml`, default
image, `S3_FORCE_PATH_STYLE=true`) already permits the browser-direct PUT — no bucket CORS policy
change was needed. This was the one open risk flagged in the approved execution plan; it did not
materialize, so implementation proceeded directly per the plan with no detour.

## 2. Upload flow verification (live UI, not just the Phase 0 script)

After building the UI, repeated the same flow through the **actual rendered form** on
`http://localhost:3000/places/dinh-cau` (a real, published place) — logged in via the real
`/login` page, selected a file on the real `#review-image` input (simulated via a `DataTransfer` +
native `change` event dispatch, since no OS file dialog is scriptable in this sandbox), and
observed:
- Image preview (`<img alt="Ảnh xem trước">`) rendered immediately.
- Network log showed the identical presign(201)→OPTIONS(204)→PUT(200)→register(201) sequence,
  now driven entirely by `useSingleImageUpload`/`ReviewsSection.tsx`, not the Phase 0 script.
- Zero console errors during the entire interaction (`read_console_messages` empty).

## 3. Attached review verification

Filled in rating/content, submitted the form (`POST /places/{id}/reviews` → `201 Created`), then
verified at the **database level** (not just the API response) that the review is genuinely linked
to the uploaded media:

```
review_id: 09a3e0ec-8a34-499e-a5c8-e7d05c54bbe3 | rating: 5
content: Live browser verification review with an attached photo.
media_id: 77b4d9cd-ea6b-480f-aa7c-d5a5ff22a149 | status: pending
checksum_sha256: 10fc3c51a152e90e5b90319b601d92ccf37290ef53c35ff92507687d8a911a08
```

(`SELECT ... FROM reviews r JOIN media m ON m.review_id = r.id WHERE r.place_id = ...` — the `JOIN`
succeeding is direct proof `attachToReview()` ran correctly.) The UI also correctly transitioned to
the already-reviewed state ("Bạn đã đánh giá địa điểm này") and the new review appeared
optimistically in the list with the exact submitted content.

This is genuine local dev-database state (test user + one real review + one real `pending` media
row) — left in place as harmless dev data, consistent with how prior live-verification passes in
this repository (e.g. Media Upload Foundation's e2e MinIO round trip) have always worked. No
`DELETE /media/{id}` endpoint exists yet to clean it up (confirmed by calling it — `404 Cannot
DELETE`), which is itself consistent with decision #6 ("No delete") — the backend doesn't expose
one either.

## 4. Files changed

New:
- `apps/web/src/lib/sha256.ts`
- `apps/web/src/modules/media/types.ts`
- `apps/web/src/modules/media/api/media.api.ts`
- `apps/web/src/modules/media/useSingleImageUpload.ts`
- `apps/web/src/modules/media/useSingleImageUpload.spec.tsx` (7 tests)
- `apps/web/src/modules/reviews/ReviewsSection.spec.tsx` (7 tests — first test file for this module)

Modified:
- `apps/web/src/modules/reviews/ReviewsSection.tsx` — added the file input, preview, upload-state
  UI, and `media_ids` wiring into the existing `handleSubmit`.
- `apps/web/src/modules/reviews/reviews.module.css` — 2 new classes (`formFileInput`,
  `imagePreview`), no existing rules touched.
- `docs/data/modules/media.md` — new §11 documenting the frontend integration; corrected the now-
  stale "frontend upload UI ... out of scope" claim in §10.

No backend file, migration, or shared-types change.

## 5. Tests

| Suite | Tests | Result |
|---|---|---|
| `useSingleImageUpload.spec.tsx` | 7 | pass — end-to-end success path, disallowed MIME, oversized file, presign failure, PUT failure, no-session, `reset()` |
| `ReviewsSection.spec.tsx` | 7 | pass — submit with/without `media_ids`, reset-after-submit, preview rendering, uploading-disables-submit, upload-error-doesn't-block-submit, unauthenticated hides the form |

Both mock `next`-adjacent modules only where necessary (`@/modules/auth/session`,
`@/modules/media/api/media.api`, `@/lib/sha256` for the hook test; `@/modules/auth/AuthProvider`,
`@/modules/auth/session`, `./api/reviews.api`, `@/modules/media/useSingleImageUpload` for the
component test) — no excessive mocking, no snapshots, no timer hacks.

## 6. Build

| Check | Result |
|---|---|
| Frontend test suite, run 1 | 19 suites / 117 tests passed |
| Frontend test suite, run 2 (determinism check) | 19 suites / 117 tests passed, identical |
| Console/act warning scan (both runs) | none found |
| Frontend typecheck (`tsc --noEmit`) | clean |
| Frontend lint (`eslint . --max-warnings=0`) | clean |
| Frontend build (`next build`) | clean, 17/17 routes |
| Backend regression (`jest`, no backend file touched) | 80 suites / 824 tests passed, unchanged |
| Backend e2e (live Postgres/Redis/MinIO) | 12 suites / 95 tests passed, unchanged (incl. `media.e2e-spec.ts`) |
| Full monorepo build (turbo) | 4/4 tasks succeeded |
| Live browser upload | see §1–§3 |
| Live review submission with image | see §3 |
| `git diff --check` | clean (only benign LF→CRLF autocrlf notices) |
| Secret scan (new/changed files) | no matches |

One incidental finding during validation, not a defect in this milestone's code: running
`tsc --noEmit` while the `web` dev server is live intermittently produced a corrupted
`.next/dev/types/routes.d.ts` (a Next.js-internal, gitignored typegen artifact caught mid-write).
Resolved by stopping the dev server and deleting `.next` before the authoritative typecheck run —
matches how every prior milestone in this session has run `tsc`. `apps/web/next-env.d.ts` was also
auto-touched by the dev server (pointing at `.next/dev/types` instead of `.next/types`) and was
reverted before committing, since it is a generated file with no source content of its own.

## 7. Scope discipline

Confirmed NOT added, per the fixed Owner decisions: drag-and-drop, gallery management, delete,
reorder, a real progress bar (only a text loading state), image cropping/editing, multiple-file
selection, moderation UI, or image display anywhere outside the review submission flow itself.

## 8. Final git status

Clean after commit (see §10).

## 9. Documentation and governance

- `docs/data/modules/media.md` §11 (new) + §10 correction (this report, §4).
- `docs/delivery/state.yaml` governance entry, following the established convention.
- This report.

## 10. Commit hashes

| Commit | Scope |
|---|---|
| `99e553a` | `feat(web)`: single-image upload on review submission |
| `37662a8` | `docs(web)`: media.md + governance for Image Upload UI |
