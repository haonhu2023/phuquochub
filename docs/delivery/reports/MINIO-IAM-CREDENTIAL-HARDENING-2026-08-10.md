# MinIO IAM Least-Privilege + Root Credential Rotation — Production Close-Out

## Status

**Complete / Verified.** Closes out the operational rollout that follows commits `15a2bca` (fix:
return published media in review responses), `a9c25f8` (fix: render review media), `87d010e`
(feat: serve published media via signed redirects), and `b696584` (fix: reconcile media proxy
config with production) — those four commits shipped the **Secure Private Media** architecture
(private bucket + signed-redirect delivery, `docs/data/modules/media.md` §13.1-§13.7). This
close-out documents the **operational hardening step that followed**, performed directly against
production infrastructure: replacing the MinIO root credential used by the application with a
dedicated least-privilege user, and rotating the root credential itself.

**Provenance note:** the infrastructure changes and verification checks described below were
performed and reported by the operator/Owner directly against production (VPS, MinIO, live API) —
**not executed by this documentation session**, which is repository-only and has no access to
production infrastructure. This report is a documentation-only record of the state as reported;
no repository code was changed to produce it, and no production system was touched from this
session. See the "Non-claims" section at the end.

## What changed (production infrastructure, outside this repository)

1. Created a dedicated MinIO application user, `phuquochub-app-20260810`, with a least-privilege
   policy on bucket `phuquochub-prod`: `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` only —
   **no `s3:ListBucket`**.
2. Tested the new user's `GetObject`/`PutObject`/`DeleteObject` independently of the running API,
   and confirmed `ListBucket` is denied for it, **before** switching the API over (per the
   ordering requirement in `docs/data/modules/media.md` §13.9).
3. Pointed production `S3_ACCESS_KEY`/`S3_SECRET_KEY` at the new user and verified the media
   delivery path end-to-end (see Evidence below).
4. Rotated the MinIO root credential — **only after** step 3 was confirmed passing.
5. Re-verified the media delivery path after the root rotation.
6. Root credential is now administrative-only; it is not loaded into the `api` container at any
   point.

No application code changed as part of this hardening — it is entirely a MinIO IAM/credential
change plus the corresponding `.env` values on the VPS. The architecture itself (private bucket +
signed-redirect delivery) was already in place from the four commits listed above and is
unchanged by this milestone.

## Architecture (unchanged, recapped for reference)

```
client  ──GET {API_PUBLIC_URL}/api/media/{id}/file──►  API
                                                        │ published + not-deleted check
                                                        │ signs a short-lived GET URL
        ◄──────────── 302 Location: signed URL ─────────┘
        ──────────GET signed URL──────────►  object storage (bucket PRIVATE, phuquochub-prod)
```

Full design (why 302 not stream-through, the 404-invariant across
pending/hidden/rejected/deleted/nonexistent, cover-image handling): `docs/data/modules/media.md`
§13.1-§13.3.

## IAM model (this milestone's addition)

| Role | Used for | Permissions on `phuquochub-prod` |
|---|---|---|
| MinIO root (`MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`) | Manual administration only (create users, change policy, console access) — never loaded into `api` | Full admin (MinIO default) |
| `phuquochub-app-20260810` | `S3_ACCESS_KEY`/`S3_SECRET_KEY` used by production `api` | `GetObject`, `PutObject`, `DeleteObject` — **no `ListBucket`** |

`ListBucket` is deliberately withheld from the application user for the same reason the original
anonymous-`download` policy was a problem (`media.md` §13.1: it granted `GetObject` **and**
`ListBucket`, allowing full bucket enumeration). Withholding it from the app credential is a
second, independent layer on top of the private bucket policy: even if `S3_ACCESS_KEY`/
`S3_SECRET_KEY` were to leak, the object keyspace cannot be enumerated — only objects whose key the
application already knows (from `media.object_key` in Postgres) can be read/written/deleted.

Full model + the step-by-step rotation runbook: `docs/data/modules/media.md` §13.8-§13.9.

## Required production configuration (recap)

| Variable | Must be | Never |
|---|---|---|
| `API_PUBLIC_URL` | `https://phuquochub.com` | — |
| `S3_ENDPOINT` | `https://media.phuquochub.com` (public origin, SigV4 signs Host header) | `http://minio:9000` (internal-only, browser can't resolve) |
| `S3_BUCKET` | `phuquochub-prod` | left unset (silently falls back to `phuquochub-dev`) |
| `S3_REGION` | `us-east-1` (MinIO doesn't enforce region, kept for SDK/signature compatibility) | — |
| `S3_FORCE_PATH_STYLE` | `true` | `false` (MinIO requires path-style) |
| `S3_PRESIGN_GET_TTL` | `300` (30..3600 valid) | — |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | credentials of `phuquochub-app-20260810` (or its eventual successor per the rotation runbook) | **the MinIO root credential, under any circumstance** |

Full table with rationale: `docs/data/modules/media.md` §13.5.

## Evidence (as reported by the operator, production, 2026-08-10)

| Check | Expected | Reported result |
|---|---|---|
| Unsigned direct object GET | `403` | `403` — bucket private, confirmed |
| `GET /api/media/{id}/file` (published media) | `302` to a presigned GET URL | `302`, confirmed |
| Presigned GET URL | `200`, `image/jpeg` | `200 image/jpeg`, confirmed |
| `pending`/`hidden`/`rejected`/soft-deleted/nonexistent media via the API | `404` (uniform, per the §13.3 invariant) | Unaffected by this rotation — invariant enforced independently of credentials |
| MinIO console (`:9001`) | Not publicly reachable | Confirmed not publicly reachable |
| Review image in a real browser | Renders correctly | Confirmed rendering correctly post-hardening |
| API | Healthy | Confirmed |
| MinIO | Healthy | Confirmed |
| Root credential rotation | Completes without breaking media delivery | Confirmed — re-verified after rotation |

## Rollback

Four scenarios (signed-media failure pre-lockdown, temporary emergency anonymous-download
rollback, application-credential rollback, root-credential rollback), each with its exact
procedure: `docs/data/modules/media.md` §13.10. **No database migration is involved in any
rollback path for this hardening** — it is purely a MinIO IAM/credential and application-config
concern.

## Operational notes

- `media.phuquochub.com` must preserve the inbound Host header when Caddy proxies to MinIO (SigV4
  signs it) — never add a `header_up Host ...` override for that site block. Already documented in
  `infrastructure/caddy/Caddyfile`'s own comments (left unchanged by this milestone — already
  complete) and cross-referenced from `docs/data/modules/media.md` §13.11.
- MinIO admin/console port `:9001` must stay private — no Caddy site block proxies it.
- Caddy remains the sole public ingress for the entire stack (postgres/redis/minio publish no host
  ports).
- VPS rollback backups currently retained (see `docs/data/modules/media.md` §13.11 for the removal
  criteria — not to be deleted casually):
  - `/home/deploy/backups/a9c25f8-pre/web-review-files.tar.gz`
  - `/home/deploy/backups/87d010e-pre/current-files.tar.gz`
  - `/home/deploy/backups/.env-before-minio-root-rotate-20260810`
  - `/home/deploy/phuquochub-deploy.tar.gz` (temporary)

## Documentation

- This report.
- `docs/data/modules/media.md` — extended §13.5's configuration table (added
  `S3_ACCESS_KEY`/`S3_SECRET_KEY`/`S3_BUCKET`/`S3_REGION`/`S3_FORCE_PATH_STYLE` rows); added new
  §13.8 (IAM model), §13.9 (rotation runbook), §13.10 (rollback), §13.11 (operational notes),
  §13.12 (expected security checks + this milestone's evidence); added two links under "Related".
- `docs/architecture/deployment.md` §6.6 — added a dated bullet summarizing the IAM/rotation
  change with links to the detail above.
- `docs/delivery/HOSTINGER-VPS-BOOTSTRAP-RUNBOOK.md` Stage 11 — added a one-line cross-reference
  note (the firewall/network posture itself is unchanged by this milestone).
- `docs/delivery/PRODUCTION-ACCESS-AND-SECRET-BOUNDARIES.md` §2 — added the MinIO root credential
  and the MinIO application-user credential to the "must never be stored in this repository" table
  (only the R2 credential was listed there before).
- `.env.example` — added a comment above `S3_ACCESS_KEY`/`S3_SECRET_KEY` clarifying that the local
  dev default (`minioadmin`) is the MinIO root credential and is fine only for local
  `docker compose up`; production must use the dedicated least-privilege user.
- `docker-compose.prod.yml` — corrected a stale comment above the `S3_ACCESS_KEY`/`S3_SECRET_KEY`
  environment entries that instructed production to match `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`
  (root) — that guidance predates this hardening and was actively wrong; replaced with guidance
  matching the new IAM model. **No values or logic changed** — the `${VAR:-default}` fallbacks are
  unchanged (they only apply to zero-config local `docker compose up`; production always sets
  these explicitly via `.env`).

No `infrastructure/caddy/Caddyfile` change was needed — its existing comments already fully cover
the Host-header and console-privacy requirements (verified by inspection, not merely assumed).

## Non-claims

- This documentation session did not create the MinIO user, did not rotate the root credential,
  and did not run any of the HTTP checks in the Evidence table — those were performed against real
  production infrastructure by the operator/Owner, outside this repository and this session, and
  are recorded here as reported.
- No secret value (access key, secret key, password) appears anywhere in this report or in any
  file touched by this milestone — only identifiers (e.g. the username `phuquochub-app-20260810`)
  and structural facts (permission names, variable names, file paths).
- No application code was modified.
- No production system was modified, deployed to, or queried from this session.
- No database migration is part of this milestone.
- `docs/delivery/state.yaml` was deliberately **not** updated as part of this close-out — that
  ledger's `current.task`/`completed_tasks` chain follows a task-file/preflight-authorization
  process (`docs/delivery/tasks/*.yaml`) that this ad hoc documentation session did not go through.
  Appending to it here would risk misrepresenting that governance chain. If the team wants this
  milestone reflected there, it should be added following that project's own convention, separately
  from this report.
