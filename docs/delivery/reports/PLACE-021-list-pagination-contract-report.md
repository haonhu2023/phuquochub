# PLACE-021 — List-pagination contract reconciliation (B1 / GAP-05 / GAP-10)

- **Task:** PLACE-021 (`docs/delivery/tasks/PLACE-021.yaml`)
- **Type:** contract_remediation
- **Date:** 2026-07-24
- **Outcome:** **COMPLETED — GAP-05 & GAP-10 RESOLVED by decision + evidence**
- **Authority:** OD-B1 (B1-A) + ADR-010 Accepted, 2026-07-24 (`docs/delivery/decisions/OWNER-DECISIONS-2026-07-24.md`)
- **Evidence index:** `docs/delivery/evidence/PLACE-021-list-pagination-contract-evidence-index.md`

## 1. What was decided vs. what was done

Owner decision **B1-A** ratifies the **existing offset `page`/`limit`** pagination as the authoritative
public contract; **no cursor pagination**. The work was therefore a **documentation/contract
reconciliation to runtime plus contract tests** — **zero runtime behaviour change**.

**Key evidence-driven correction:** the runtime returns **HTTP 400** for invalid `page`/`limit`/`price_range`
(NestJS `ValidationPipe` default; `AllExceptionsFilter` maps 400 → `VALIDATION_ERROR`), but the OpenAPI
documented **422**. Under B1-A the runtime is authoritative, so the OpenAPI was corrected **422 → 400** —
the code was **not** changed. This was confirmed live before and after (see §4).

## 2. Changes (docs + tests only; no source logic)

| File | Change |
|---|---|
| `docs/api/openapi.yaml` | `listPlaces`: operation description now states the offset contract is ratified (ADR-010/OD-B1, GAP-05/10 resolved); `page`/`limit`/`price_range` invalid-value docs corrected **422 → 400**; added `'400': BadRequest` response; `status`/`sort`/`cursor` kept **deprecated** (per OD-F-6) with descriptions updated to state cursor is decided-against for v1 under ADR-010. |
| `docs/api/api.md` | Offset pagination line corrected **422 → 400** and annotated as the ratified contract; cursor line updated to "decided not adopted for v1 (ADR-010/OD-B1)". |
| `apps/api/test/places-list-contract.e2e-spec.ts` (new) | 11 contract tests over the real HTTP API with a **production-equivalent** pipe (`whitelist + transform + forbidNonWhitelisted`). |

**Not changed:** `places.controller.ts`, `places.service.ts`, `places.repository.ts`, `places.dto.ts`,
shared types — pagination runtime is byte-identical. No database query changed. No cursor pagination
introduced anywhere.

## 3. The ratified public contract (`GET /api/places`)

- `page`: integer ≥ 1, default **1**; invalid (`<1` / non-integer) → **400**.
- `limit`: integer ≥ 1, default **20**; `>100` **clamped to 100** (200, `meta.pageSize` reflects clamp); invalid → **400**.
- Ordering: fixed server-side `rating_avg DESC NULLS LAST, created_at DESC, id ASC` (deterministic).
- `meta`: `timestamp`, `page`, `pageSize`, `total`, `totalPages` (= `ceil(total/pageSize)`).
- Unknown / deprecated params (`status`/`sort`/`cursor`) → **400** (`forbidNonWhitelisted`).

## 4. Verification (Node v20.20.2 / npm 10.8.2)

| Check | Result |
|---|---|
| OpenAPI parse (`js-yaml`) | ✅ PASS |
| Governance YAML parse | ✅ 27/27, 0 failures |
| Lint (`src` + `test`, `--max-warnings=0`) | ✅ PASS |
| Typecheck (`tsc --noEmit`) | ✅ PASS |
| Full unit (`jest`) | ✅ **210/210**, 29 suites (unchanged) |
| Full API e2e | ✅ **33/33**, 6 suites (22 prior + **11 new contract**) |
| New contract spec alone | ✅ **11/11** |
| Clean build (`turbo --force`, caches+tsbuildinfo purged) | ✅ 4/4, 0 cached |
| Artifacts | ✅ `main.js`, `app.module.js`, `dist/core/` (33), **153 src == 153 js** |
| Boot API + web | ✅ health **200** (db=up, redis=up), web `/` **200** |
| HTTP pagination (prod build) | ✅ default 1/20 (total 49, totalPages 3); page=2/limit=5; limit=500→clamp 100; page=0→400; page=abc→400; limit=0→400; cursor→400 `VALIDATION_ERROR` |
| Processes terminated / ports | ✅ PIDs killed; 4000 & 3000 FREE |

## 5. Runtime behaviour & API contract

- **Runtime behaviour changed:** **NO** — pagination logic untouched; existing places specs unmodified and green.
- **Public API contract changed:** **documentation only** — corrected to match long-standing runtime (422→400 was a doc bug). Fully backward compatible; no request that previously succeeded now fails.

## 6. GAP-05 / GAP-10 resolution

Both were "openapi `listPlaces` declares `status`/`sort`/`cursor`; impl uses offset `page`/`limit`;
authority conflict — owner adjudication required." Owner adjudicated (B1-A): **offset is the contract**.
The OpenAPI/api.md now match runtime exactly, deprecated params are unambiguously documented as invalid
(400) and retained per ADR-010's deprecation policy, and contract tests pin the behaviour.
→ **GAP-05 RESOLVED**, **GAP-10 RESOLVED** (by decision + contract evidence).

## 7. Follow-ups (not this task)

- **Build hygiene (minor):** `apps/api/tsconfig.build.tsbuildinfo` lives outside `dist`, so `deleteOutDir`
  + deleting `dist` does not clear the incremental cache; a rebuild without purging it can emit nothing.
  CI starts from a clean checkout so this is not a production risk. Recorded for a future hygiene task.
- **Doc-vs-runtime 422/400 on OTHER endpoints:** POST/PATCH etc. still reference the `422 UnprocessableEntity`
  response while the runtime returns 400. **Out of scope for B1** (no unrelated endpoint cleanup); recorded
  as a follow-up finding for a global contract-code reconciliation task.

## 8. Non-claims

Resolving GAP-05/GAP-10 does not implement B2–B7, does not add cursor pagination, and does not assert
overall release readiness. It ratifies and documents the existing offset contract only.
