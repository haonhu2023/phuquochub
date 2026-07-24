# Owner Decisions — 2026-07-24 (release-blocker adjudication)

- **Owner:** Project Owner
- **Approval evidence:** owner instruction supplied in-session, 2026-07-24 ("Owner decisions are now issued" — B1-A, ADR-010 Accept, B2-A, B3-A, B4-A, B5-B, B6-A, B7-A). No individual approver name, job title, ticket, or meeting exists in repository context and none is asserted.
- **Decision date:** 2026-07-24
- **Evidence base (preserved):** `docs/delivery/reports/OWNER-DECISION-PACKAGE-2026-07-24.md` — the option analysis these decisions select from. Retained unchanged as the decision evidence.

> **A recorded decision is NOT completed engineering work.** Only B1 is authorized for implementation now (PLACE-021). B2, B3, B4, B7 remain APPROVED-but-PENDING proposed tasks; B5 is an accepted documented risk (behaviour already softened by PLACE-016); B6 is deferred. None may be represented as implemented.

## Classification

| Class | Decisions |
|---|---|
| **Accepted implementation decision** | OD-B1 (+ ADR-010 Accept), OD-B2, OD-B3, OD-B4, OD-B7 |
| **Accepted temporary risk** | OD-B5 |
| **Deferred optimization** | OD-B6 |

## Decisions

### OD-B1 — Ratify offset pagination; accept ADR-010 · ACCEPTED
- **Chosen option:** B1-A (decision package §B1). **Resolves:** GAP-05, GAP-10 (by decision).
- **Statement:** The existing offset pagination contract (`page`/`limit`) is ratified as the authoritative public list contract. `status`/`sort`/`cursor` remain **unimplemented** (HTTP 400) and stay documented as **deprecated** — not deleted — governed by the ADR-010 deprecation/sunset policy. **No cursor pagination** is implemented. ADR-010 (API Versioning) moves **Proposed → Accepted** as the governing versioning decision.
- **Implementation:** **AUTHORIZED — PLACE-021** (this turn). Runtime pagination behaviour preserved; OpenAPI/api.md reconciled to runtime.
- **Release impact:** clears the sole hard release blocker.

### OD-B2 — Rename privileged card-fetch + architecture test · ACCEPTED
- **Chosen option:** B2-A. **Addresses:** F-24.
- **Statement:** Rename `PlacesRepository.getCardById` to a privileged-signalling name and add an architecture test asserting no `@Public` route can reach it. Behaviour unchanged.
- **Implementation:** **PENDING** — proposed task, NOT executed here.

### OD-B3 — Deterministic bbox cluster truncation · ACCEPTED
- **Chosen option:** B3-A. **Addresses:** F-34.
- **Statement:** `bboxClusters` gains `ORDER BY cnt DESC, <cell key> ASC` before `LIMIT 500` (densest-first, deterministic tie-break). Additive to a currently unordered endpoint.
- **Implementation:** **PENDING** — proposed task, NOT executed here.

### OD-B4 — Remove SearchResult.score from public payload · ACCEPTED
- **Chosen option:** B4-A. **Addresses:** SearchResult.score exposure.
- **Statement:** Drop `score` from the public `/search` payload; retain `ts_rank` internally for ordering only.
- **Implementation:** **PENDING** — proposed task, NOT executed here.

### OD-B5 — Accept provisional Phú Quốc boundary (documented risk) · ACCEPTED (TEMPORARY RISK)
- **Chosen option:** B5-B. **Addresses:** F-1 / PROVISIONAL bbox.
- **Statement:** The current `PHU_QUOC_BOUNDS` is accepted as a **documented provisional boundary for the initial release**. It is **not** authoritative and must not be claimed as such. The existing softened behaviour (out-of-box → audit warning only, never rejection — OD-F-1/PLACE-016) is retained. Replacement with an authoritative boundary remains required future work.
- **Implementation:** **NO NEW CODE** — behaviour already implemented by PLACE-016. Accepted risk recorded; F-1 stays a documented non-blocking caveat for GA.

### OD-B6 — Defer index-planner proof · DEFERRED (OPTIMIZATION)
- **Chosen option:** B6-A. **Addresses:** GAP-06 / F-15.
- **Statement:** `idx_places_status_active` exists and is applied; proving the planner *chooses* it requires representative data volume. Defer EXPLAIN evidence to a future performance task at scale. **Do not add or alter indexes now.**
- **Implementation:** **DEFERRED** — non-blocking; no schema change.

### OD-B7 — TypeORM is the authoritative runtime persistence model · ACCEPTED
- **Chosen option:** B7-A. **Addresses:** GAP-15.
- **Statement:** TypeORM migrations/entities are the authoritative runtime persistence model. `prisma/schema.prisma` is **reference-only** and must not be treated as executable schema authority.
- **Implementation:** **PENDING** — the authority ADR/register note is a separate proposed task, NOT executed here (this file records the decision).

## Traceability
| Decision | Selects | Item | Status after decision |
|---|---|---|---|
| OD-B1 | B1-A + ADR-010 | GAP-05, GAP-10 | RESOLVING (PLACE-021 authorized) |
| OD-B2 | B2-A | F-24 | APPROVED · impl PENDING |
| OD-B3 | B3-A | F-34 | APPROVED · impl PENDING |
| OD-B4 | B4-A | SearchResult.score | APPROVED · impl PENDING |
| OD-B5 | B5-B | F-1 / bbox | ACCEPTED RISK · no new code |
| OD-B6 | B6-A | GAP-06 / F-15 | DEFERRED |
| OD-B7 | B7-A | GAP-15 | APPROVED · impl PENDING |
