# MEDIA UPLOAD FOUNDATION — FINAL STATUS

## 1. Status

**Complete.** Backend-only Media Upload Foundation delivered per the design-review-approved plan
(3 required changes: metadata-only persistence, bucket isolation, HEAD-first/GET-stream-fallback
checksum verification), plus the presign-session integrity mechanism that closed a gap the
original plan had left unresolved. Full validation green (unit, e2e, live MinIO round-trip,
typecheck, lint, build, migration status, `git diff --check`, secret scan). No frontend work
started, per explicit instruction.

## 2. Environment

- Node v20.20.2 / npm 10.8.2 (pinned, `.nvmrc`/`engines`) used for all install/validation.
- Docker Desktop restarted this session; `phuquoc-postgres`/`phuquoc-redis`/`phuquoc-minio` all
  healthy throughout.
- Branch `master`, clean tree at the start of this milestone (confirmed via preflight).

## 3. Updated design decisions

Applying the three approved design-review changes to the (never-before-seen-in-this-session)
implementation plan:

1. **Persist object metadata only.** `media.url` made nullable; new upload rows never populate it.
   Only `object_key`/`bucket`/`content_type`/`size_bytes`/`checksum_sha256` are persisted. No
   presigned/signed/absolute URL column was added anywhere.
2. **Separate dev/test buckets.** `phuquochub-dev` (default) / `phuquochub-test` (when
   `NODE_ENV=test`) — `S3_BUCKET` is the sole production override, server-configured only, never
   client-influenced.
3. **`verifyUploadedObject()`: HEAD first, GET-stream fallback.** Implemented exactly as specified,
   provider-agnostic (MinIO/S3/R2), never buffers the full object.

Plus, per the full spec that followed the 3-change approval: **presign-session integrity via
Redis** (not a new DB table), **supported ownership scope limited to `place_id`/orphan**, and the
**exclusive-owner CHECK relaxed from exactly-one to at-most-one**.

## 4. Files added

Backend:
- `apps/api/src/core/storage/storage.service.ts`, `storage.module.ts`, `storage.service.spec.ts`
- `apps/api/src/core/database/migrations/1720002900000-AddMediaUploadFoundation.ts` (+ spec)
- `apps/api/src/core/database/migrations/1720003000000-SeedMediaPermissions.ts` (+ spec)
- `apps/api/src/modules/media/dto/media.dto.ts` (+ spec)
- `apps/api/src/modules/media/media.service.ts` (+ spec)
- `apps/api/src/modules/media/media.controller.ts` (+ spec)
- `apps/api/test/media.e2e-spec.ts`

Docs:
- `docs/data/modules/media.md`
- `docs/delivery/reports/MEDIA-UPLOAD-FOUNDATION-2026-07-30.md` (this report)

## 5. Files modified

- `apps/api/package.json`, `package-lock.json` — 2 new dependencies (additive-only diff, verified).
- `apps/api/src/app.module.ts` — registers `StorageModule`.
- `apps/api/src/core/config/configuration.ts`, `env.validation.ts` — S3 config block, environment-
  aware bucket default.
- `apps/api/src/modules/media/entities/media.entity.ts` — `url` nullable, 5 new columns, updated
  comments (also corrected 2 pre-existing stale claims found while touching this file: the CHECK
  description and a stale "review_id/event_id have no FK" note — both now have real FKs).
- `apps/api/src/modules/media/media.module.ts` — wires up the new controller/service.
- `apps/api/src/modules/media/repositories/media.repository.ts` (+ spec) — 3 new methods
  (`placeExists`, `findByUploaderAndChecksum`, `createUploaded`).
- `.env.example` — `S3_*` block updated for the new bucket-default scheme; `S3_FORCE_PATH_STYLE`
  added.
- `docs/api/openapi.yaml` — `/media/presign`/`/media` rewritten to match the real implementation;
  `Media.url` now nullable in the schema. `/media/{id}` and `/media/{id}/moderate` untouched
  (still unimplemented, out of scope).
- `docs/delivery/state.yaml` — governance entry added (see §20).

## 6. Dependencies added

- `@aws-sdk/client-s3@^3.1101.0`
- `@aws-sdk/s3-request-presigner@^3.1101.0`

Lockfile diff is purely additive (414 insertions, 0 deletions) — no existing package version
changed. `npm audit` shows 1 pre-existing high-severity finding (`brace-expansion`, via
`@nestjs/cli`/`jest`'s transitive `glob`/`minimatch` tree) — confirmed unrelated to the new
dependencies (traced via `npm ls brace-expansion`) and pre-existing before this milestone.

## 7. Migration details

`AddMediaUploadFoundation1720002900000`:
- `media.url` → nullable (always safe, no backfill needed regardless of row count).
- Adds `object_key varchar(300)`, `bucket varchar(100)`, `content_type varchar(100)`,
  `size_bytes int`, `checksum_sha256 char(64)` — all nullable.
- Relaxes `chk_media_one_owner` (`= 1`) → `chk_media_at_most_one_owner` (`<= 1`).
- Adds `idx_media_uploader_checksum` (unique, partial: `uploaded_by, checksum_sha256` WHERE not
  soft-deleted and checksum present) and `idx_media_uploaded_by` (partial, previously absent).
- `down()` refuses (throws, does not silently destroy data) if any row has `object_key IS NOT
  NULL`, `url IS NULL`, or zero owners set — each would make the corresponding rollback step
  unsafe. Verified live: the dev `media` table was queried and confirmed **empty (0 rows)** before
  this migration ran; a full revert → reapply drill was then performed successfully against the
  live dev database while it was still empty.

`SeedMediaPermissions1720003000000`: adds `Media.Upload.Own`, granted to `member`.

Both applied to the live dev database (`migration:show` → `[X]` for both, IDs 37/38).

## 8. Storage configuration

- `StorageService` (`core/storage/`) wraps `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`.
  AWS SDK types never leave this file.
- Config (`configuration.ts`): `s3.{endpoint,region,accessKeyId,secretAccessKey,bucket,
  forcePathStyle}`, sourced from `S3_ENDPOINT`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`/`S3_BUCKET`/
  `S3_REGION`/`S3_FORCE_PATH_STYLE`.
- Bucket default: `S3_BUCKET` env var if set (production override) else `phuquochub-test` (when
  `NODE_ENV=test`) else `phuquochub-dev`. Jest sets `NODE_ENV=test` by default (its own built-in
  behavior, not a new override introduced here) and `dotenv` does not overwrite an already-set
  `process.env.NODE_ENV` — so e2e tests are isolated to `phuquochub-test` automatically, with zero
  new test-specific environment override required.
- `onModuleInit()` auto-creates the dev/test bucket if missing (HeadBucket → CreateBucket on 404);
  never runs when `NODE_ENV=production`.
- No production R2 credentials configured or required anywhere — intentionally out of scope.

## 9. API contracts

| Method | Route | Permission | Rate limit |
|---|---|---|---|
| POST | `/media/presign` | `Media.Upload.Own` | 10/min |
| POST | `/media` | `Media.Upload.Own` | (global default only) |

`POST /media/presign` — `{content_type: image/jpeg\|image/png\|image/webp, size: 1..10485760,
checksum_sha256: 64 lowercase hex, place_id?: uuid}` → `201 {key, upload_url, expires_in: 600}`.
`business_id`/`post_id`/`event_id`/`review_id` rejected `400` (whitelist), not silently ignored.

`POST /media` — `{key, caption?: ≤300, alt?: ≤200}` → `201` with the existing `Media` response
shape (`url` always `null` — every new row is `pending`).

## 10. Presign-session integrity

Redis-backed, TTL 900s (longer than the 600s presigned URL), keyed `media-presign:{object_key}`,
value `{userId, contentType, size, checksumSha256, placeId}`. `POST /media` requires the session to
exist and belong to the caller; uses the session's values (not client input) for verification; the
session is deleted after successful registration or after a terminal verification failure. No new
DB table — reuses `RedisService` + the exact key/TTL pattern already established by
`TokenService`'s refresh-token records.

## 11. Ownership behavior

Only `place_id` or no owner (orphan) accepted at presign time. `business_id`/`post_id`/`event_id`/
`review_id` rejected `400`. A `place_id`-owned upload only confirms the place exists — it does
**not** claim official business ownership; the resulting row is a community-contributed `pending`
photo. Review attachment continues to use the pre-existing `MediaRepository.attachToReview()`.

## 12. Upload verification behavior

`HeadObject` → reject missing/zero-byte/>10 MiB/content-type-mismatch/size-mismatch → compare a
trustworthy HEAD-native SHA-256 if present, else `GetObject` + stream + hash (never buffered fully,
aborts mid-stream past 10 MiB) → on any mismatch, delete the object and refuse to create a row. In
practice, because the presigned PUT deliberately does not request a checksum trailer (avoiding
friction for simple HTTP-client uploads given no frontend UI exists yet), every real upload in this
milestone verifies via the streaming fallback — confirmed live against MinIO in `media.e2e-spec.ts`.

## 13. Duplicate handling

Unique index `(uploaded_by, checksum_sha256)` (partial) plus an app-level pre-check. A second
registration of the same content by the same uploader: the redundant just-uploaded object is
deleted from storage, the Redis session is deleted, and `409 Conflict` is returned — no second row
is created. Different uploaders registering identical content is **not** blocked (not a
duplicate in any meaningful sense).

## 14. Orphan handling

A `place_id = NULL` media row (no `place_id` at presign) is a valid state — "uploaded, not yet
attached" — resolved later via the existing `attachToReview()` flow, or left unattached
indefinitely. **No background cleanup job exists** for orphaned media rows or for storage objects
whose presign session expired before `POST /media` was ever called (the Redis session self-expires
after 900s, but the object itself is not auto-deleted) — both risks are explicitly acknowledged
and documented in `docs/data/modules/media.md` §6, not silently omitted; a future task would add a
cleanup job, deliberately out of scope here per instruction.

## 15. Unit test results

**80 suites / 800 tests passed** (up from the 74/724 pre-milestone baseline). New: `storage.
service.spec.ts` (16), `media.dto.spec.ts` (28), `media.service.spec.ts` (12), `media.controller.
spec.ts` (3), `media.repository.spec.ts` additions (5), 2 migration structural-test files (12).

## 16. E2E results

**12 suites / 91 tests passed** (up from 11/81). New `media.e2e-spec.ts` (10 tests) proves, against
the real Docker stack: presign validation boundaries, the full presign→real-PUT-to-MinIO→register
round trip, cross-user rejection (403), tampered-checksum rejection (422, via the real GET-stream
fallback), and duplicate-checksum rejection (409, with proof the rejected object is actually gone
from storage). One test-suite-internal fix was needed: trimmed 3 redundant DTO-validation e2e cases
(already exhaustively covered by the unit-level `media.dto.spec.ts`) to keep total `presign()`
calls under the endpoint's own 10/min throttle — the same "Nth request trips the suite's own rate
limit" pitfall `bookings.e2e-spec.ts` had already encountered and documented.

## 17. Live MinIO evidence

- Migration applied to the live dev DB; schema verified via `\d media` (all 5 columns, both new
  indexes, the relaxed CHECK, all present and correct).
- Full revert → reapply drill performed on the live dev DB while `media` was empty (0 rows,
  explicitly queried and confirmed before running any migration).
- `media.e2e-spec.ts` performs real `PUT` requests directly against the live MinIO instance
  (`phuquochub-test` bucket) using Node's native `fetch` — not mocked.

## 18. Full regression results

Backend unit: 80/80 suites, 800/800 tests. Backend e2e: 12/12 suites, 91/91 tests. Zero regression
in any pre-existing suite.

## 19. Build result

Full monorepo build (`npm run build`, turbo): 4/4 tasks succeeded, no "no output files found"
warning — the build-determinism fix from the Search Filters post-implementation review was
re-confirmed still holding. `apps/api/dist/` contains the compiled `storage.service.js`/
`media.service.js`. Typecheck and lint (backend) both clean. `git diff --check`: clean (no
whitespace errors). Manual secret-pattern scan of the diff: 0 matches beyond already-established
dev-default placeholders.

## 20. Documentation/governance updates

- `docs/data/modules/media.md` (new) — full domain doc following this session's established
  convention (booking.md/availability.md/transport.md).
- `docs/api/openapi.yaml` — `/media/presign`/`/media` reconciled to the real implementation;
  `Media.url` nullable.
- `docs/delivery/state.yaml` — `current.task` and `next_action.objective` both updated with this
  milestone as the newest entry, preserving the full prior history chain.

## 21. Intentionally deferred work

Frontend upload UI, thumbnails, resizing, WebP/AVIF conversion, EXIF processing, OCR, AI tagging,
moderation, virus scanning, CDN optimization, bulk uploads, production R2 configuration, background
cleanup jobs for orphaned media/objects — all explicitly out of scope per instruction, none
attempted.

## 22. Remaining risks

- Orphaned storage objects/media rows are never automatically cleaned up (§14) — acknowledged, not
  a regression, deferred by explicit instruction.
- The HEAD-native-checksum branch of `verifyUploadedObject()` is implemented but not exercised by
  any real upload in this milestone (the presigned PUT doesn't request a checksum trailer) — this
  is a deliberate, documented trade-off (§12), not a gap; the streaming fallback is fully exercised
  and provider-agnostic.
- `npm audit`'s one pre-existing high-severity finding (`brace-expansion`, dev-tooling-only,
  unrelated to this milestone) remains open — not introduced or worsened here, not fixed here
  either (out of scope: "Add only" the two named dependencies).

## 23. Rollback procedure

1. Revert the application code commits (see §25) — safe, no data migration needed since the schema
   changes are additive/nullable.
2. If the schema migration itself must be reverted: `AddMediaUploadFoundation1720002900000.down()`
   will refuse (throw, not destroy data) if any real upload has happened since (any row with
   `object_key IS NOT NULL`, a NULL `url`, or zero owners) — resolve those rows manually first
   (migrate forward or delete deliberately), then revert. Do **not** force a rollback past this
   guard.
3. `SeedMediaPermissions1720003000000.down()` is unconditionally safe (deletes exactly the one
   permission it added).

## 24. Final git status

Clean after commits (verified via `git status --short` immediately before and after committing).

## 25. Commit hashes

| Commit | Scope |
|---|---|
| `9dfc40b` | `feat(storage)`: S3-compatible object storage |
| `57f4a30` | `feat(db)`: media upload foundation schema (migrations) |
| `3d11cd1` | `feat(media)`: secure upload foundation (presign/register) |
| `3b77f2f` | `test(media)`: live MinIO round-trip e2e |
| `03df84f` | `docs(media)`: documentation + this report |

`git status --short` is clean after these commits.
