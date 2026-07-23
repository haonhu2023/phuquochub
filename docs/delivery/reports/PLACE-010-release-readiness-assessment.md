# PLACE-010 — Place Release-Readiness Assessment

> Workstream: place · Task: PLACE-010 · Type: release-readiness assessment · Date: 2026-07-22
> Authority: `docs/delivery/state.yaml`, `docs/delivery/tasks/PLACE-010.yaml`
> Result: **COMPLETED.** AC1–AC8 (mandatory) PASS, AC9 (optional) PASS.
>
> **Overall classification: NOT READY FOR RELEASE — engineering-complete for the no-database
> surface, blocked on environment validation and two unadjudicated contract questions.**

## 1. Executive Summary
Nine Place tasks have completed. The module has **103 passing specs** (92 module + 11 migration)
across DTO, repository, mapper, migration, service and controller layers; six gaps are closed
(GAP-06, 07, 11, 12, 13, 14); and the API and web apps both type-check clean.

That is a real engineering position, and it is worth stating plainly what it is *not*: **every
one of those 103 specs runs with the database mocked or absent.** No migration has ever been
applied, no query has ever executed against PostgreSQL, no HTTP request has ever been served,
and no guard has ever denied anyone. The Place module is well-covered at the layers that do not
need infrastructure, and entirely unverified at the layers that do.

Five findings block a release. Two are environmental (no Docker, no version control), one is a
data-correctness question awaiting the owner (the PROVISIONAL Phú Quốc bounding box), and two
are contract divergences between `openapi.yaml` and the implementation that no engineer should
resolve unilaterally.

## 2. Scope and Method
Assessment only. No product code, test, migration or configuration was modified. Every
PLACE-001…009 report and evidence index was read (§3), the validation suite was re-run to
establish current numbers rather than quoting earlier tasks (§5), and the three highest-risk
carried claims were re-verified against the repository rather than copied forward (§6).

## 3. Documents Read (AC1)
| task | execution report | evidence index |
|---|---|---|
| PLACE-001 | `reports/PLACE-001-place-domain-persistence-baseline.md` | `evidence/PLACE-001-evidence-index.md`, `PLACE-001-baseline.md` |
| PLACE-002 | `reports/PLACE-002-implementation-report.md` | `evidence/PLACE-002-evidence-index.md` |
| PLACE-003 | `reports/PLACE-003-migration-report.md` | `evidence/PLACE-003-migration-evidence-index.md` |
| PLACE-004 | `reports/PLACE-004-ordering-report.md` | `evidence/PLACE-004-ordering-evidence-index.md` |
| PLACE-005 | `reports/PLACE-005-shared-types-report.md` | `evidence/PLACE-005-shared-types-evidence-index.md` |
| PLACE-006 | `reports/PLACE-006-opening-hours-report.md` | `evidence/PLACE-006-opening-hours-evidence-index.md` |
| PLACE-007 | `reports/PLACE-007-dead-code-report.md` | `evidence/PLACE-007-dead-code-evidence-index.md` |
| PLACE-008 | `reports/PLACE-008-service-tests-report.md` | `evidence/PLACE-008-service-tests-evidence-index.md` |
| PLACE-009 | `reports/PLACE-009-controller-tests-report.md` | `evidence/PLACE-009-controller-tests-evidence-index.md` |

**Historical block reports must not be mistaken for these.**
`reports/PLACE-00{3,4,5,7,8,9}-execution-report.md` and
`evidence/PLACE-00{3,4,5}-evidence-index.md` are records of *preflight blocks* from sessions
where the task ID was prompted before it existed. They describe a repository state that no
longer holds. The suffixed files in the table above are the execution records.

## 4. Coverage Map (AC2)
| layer | specs | what it proves | **what it does not prove** |
|---|---|---|---|
| DTO (`places.dto.spec.ts`) | 30 | Phú Quốc bounds, radius cap, `opening_hours` structure, public query rejects `status` | that a real HTTP request is rejected — validation is exercised in-process via `class-validator` |
| Geo DTO (`geo.dto.spec.ts`) | 9 | nearby/bbox bounds, radius `@Max` | nothing DB-backed; no PostGIS involvement |
| Repository (`places.repository.spec.ts`) | 11 | published-only reads, parameterized SQL, deterministic ORDER BY | **that any SQL is valid** — the repository is mocked; no statement has ever reached Postgres |
| Mapper (2 specs) | 6 | row → response field mapping, `Date`/number conversions | serialization over the wire |
| Service (`places.service.spec.ts`) | 18 | forced PENDING, snake→camel patch, revision side effects, ADR-016 audit payloads | that audit events persist, that revisions are stored, that transactions hold |
| Controller (`places.controller.spec.ts`) | 23 | `@Public()` / `@RequirePermissions` per route, 201, delegation, `user.sub` | **that any guard enforces it** — declarations only (F-27) |
| Migration (`__tests__/…PartialIndex.spec.ts`) | 5 (of 11 in suite) | up/down SQL shape, ordering, non-duplication | **that the migration applies** — never executed against a database |
| e2e | **0 effective** | — | everything: routing, auth, persistence, PostGIS, transactions |
| **Total** | **103** | | |

The pattern is consistent: the module is well-tested *as a set of collaborating objects* and
untested *as a running system*.

## 5. Current Validation Baseline (AC7)
Re-run for this assessment on 2026-07-22 — not quoted from earlier tasks:

| command | cwd | exit | result |
|---|---|---|---|
| `npx jest places` | `apps/api` | **0** | **92/92 pass, 7 suites** |
| `npx jest migrations` | `apps/api` | **0** | **11/11 pass, 3 suites** |
| `npx tsc -p tsconfig.json --noEmit` | `apps/api` | **0** | clean |
| `npx tsc --noEmit` | `apps/web` | **0** | clean |

Nothing is red, so the fourth stop condition did not fire and the assessment rests on a green
suite.

## 6. Re-verification of Carried Claims (AC6)
Rather than copying these forward, each was checked against the repository today:

| claim | method | result |
|---|---|---|
| Phú Quốc bbox is still PROVISIONAL | grep `geo-bounds.ts` | **CONFIRMED** — the `⚠️ PROVISIONAL` block is intact; bounds are still seed-derived, still unconfirmed by an owner |
| PLACE-003's migration is still `implemented_not_executed` | `Get-Command docker` | **CONFIRMED** — `docker NOT FOUND`. It is not merely that no one ran it; it *cannot* have been applied on this machine |
| `node_modules/@phuquochub/shared-types` is a copy, not a link | `LinkType` / `Attributes` | **CONFIRMED** — `LinkType` empty, attributes `Directory` (no `ReparsePoint`). A real directory, so it will go stale on the next package edit |

## 7. Gate Classification (AC3, AC4)
| gate | classification | evidence | what is missing | environment required |
|---|---|---|---|---|
| **Implementation** | **PARTIAL** | 103 specs green; api+web `tsc` clean; GAP-06/07/11/12/13/14 closed | no code path has ever executed against real infrastructure | Docker + `npm run db:up` |
| **Testing** | **PARTIAL** | §4 coverage map | e2e suite self-skips without a seeded DB; guard enforcement untested | Docker (Postgres/PostGIS/Redis) |
| **Migration** | **PARTIAL** | `idx_places_status_active` authored, structurally spec'd, ordering verified | never applied; `up`/`down` never executed; no rollback rehearsal | Docker + `npm run migration:run` / `:revert` |
| **Contract / API** | **PARTIAL** | types single-sourced (PLACE-005); mapper specs pass unmodified | **openapi vs implementation diverges** on `PlaceCard.status`/`score` (F-17) and list params (F-6/GAP-05/10) | none — needs an **owner decision**, not an environment |
| **Data quality** | **PARTIAL** | coordinate bounds + `opening_hours` structure enforced and mutation-checked | bbox values themselves unconfirmed (F-1); enforcement is write-path only (F-21) | none — needs an **owner decision** |
| **Security** | **PARTIAL** | route declarations pinned (23 specs); audit payloads pinned; published-only reads pinned; dead unfiltered reader removed | guard/PDP behaviour unverified for Place routes; no negative HTTP test ever ran | a running Nest app |
| **Performance** | **NOT VERIFIED** | — | no baseline, no `EXPLAIN`; `idx_places_status_active` may not even be chosen (F-13); list ORDER BY unsupported by any index (F-15) | Docker + seeded data + `EXPLAIN (ANALYZE, BUFFERS)` |
| **Observability** | **NOT VERIFIED** | — | nothing was added and nothing was measured; no evidence any audit event reaches a sink | a running app + log/metric sink |
| **Rollback / recovery** | **PARTIAL** | every task documented a usable repository-level rollback; migration `down()` drops only its index | schema rollback never rehearsed against a database | Docker |
| **Deployment** | **NOT VERIFIED** | — | never attempted; out of scope for every task so far | a deploy target |
| **Canary** | **NOT VERIFIED** | — | no canary exists | production infrastructure |
| **Hypercare** | **NOT VERIFIED** | — | no hypercare period has occurred | production |
| **Stabilization** | **NOT VERIFIED** | — | no production run to stabilize | production |

**No gate is marked PROVEN.** That is the honest reading: every gate either has a named missing
piece or has no evidence at all.

## 8. Consolidated Findings (AC5)
28 findings from PLACE-001…009, classified:

### BLOCKS_RELEASE (5)
| id | finding | why it blocks |
|---|---|---|
| **F-1** | Phú Quốc bbox is PROVISIONAL — seed-derived, never owner-confirmed | It is now **actively enforced** on every create/update. If the box is wrong, the API silently rejects legitimate Places. A guessed constant that rejects real user data cannot ship unreviewed. |
| **F-2** | Docker not installed → no DB-backed validation anywhere | Migration application, PostGIS/SRID behaviour, `EXPLAIN`, transactions and e2e are *all* unverified. This single item gates five other gates. |
| **F-3** | Repository is not under version control (no `.git`) | No task can produce a diff-verified change surface, there is no rollback beyond manual file edits, and no release can be tagged or audited. Shipping unversioned code is not a defensible position. |
| **F-6** | GAP-05/10 — `openapi` declares `status`/`sort`/`cursor` list params; the implementation uses offset `page`/`limit` | The published contract and the served behaviour disagree. Consumers written against openapi would break. Parked pending owner adjudication since PLACE-001 — parking is not resolution. |
| **F-17** | `openapi` `PlaceCard` omits `status` and `score`, which both implementations return | Same class of defect as F-6, found during PLACE-005. The contract does not describe the payload. |

Note that **only F-2 and F-3 are environmental**. F-1, F-6 and F-17 need a *decision*, not a
machine — and could be resolved today if an owner were available.

### NON_BLOCKING (18)
| ids | theme |
|---|---|
| F-4, F-5, F-7 | local dev-environment friction (portable Node off PATH, materialized package copies, a 232 s DTO suite) |
| F-9, F-10, F-11 | delivery-process artefacts (forward-numbered prompts, ambiguous report IDs, duplicated block records) |
| F-12, F-23 | build hygiene (a spec file inside `migrations/`, stale `dist/`) |
| F-13, F-15, F-16 | performance questions that require `EXPLAIN` to answer |
| F-18, F-19, F-20 | typing precision at boundaries (row `verification_status`, `Date` vs `string`, untyped `opening_hours` response) |
| F-21, F-24, F-26, F-27, F-28 | known limitations documented at their site (write-path-only validation, undocumented filter omission, revision diffs without values, declaration-order routing check, unconstrained `:slug`) |

### RESOLVED (5)
F-8 (delivery YAML now validated every task), F-14 (GAP-12 and GAP-13 both closed), F-22
(GAP-13 confirmed and removed), F-25 (the stale `@phuquochub/utils` blocker disproven), and the
`PLACE-002` YAML syntax defect fixed during PLACE-007's session.

## 9. Recommended Order of Work (AC9)
Ordered by how much each unblocks, not by difficulty:

1. **Install Docker** — unblocks migration application, `EXPLAIN` (F-13, F-15), PostGIS/SRID
   verification, e2e, guard enforcement testing, and rollback rehearsal. One action, five gates.
2. **Put the repository under version control** — unblocks diff-verified scope proof for every
   future task and makes release tagging possible.
3. **Owner adjudication session** covering F-1 (the real bbox), F-6 and F-17 (openapi vs
   implementation). All three are decisions; none needs an environment. Cheapest real progress.
4. **The typing-precision cluster** (F-18, F-19, F-20) — small, safe, and each removes a cast or
   a lie from a boundary.
5. **Build hygiene** (F-12, F-23) — trivial, and F-12 currently lets a test file be loaded as a
   migration.

Items 1–3 are the release path. Items 4–5 are quality work that can proceed in parallel and is
what remains executable in *this* environment.

## 10. Overall Classification (AC8)
**NOT READY FOR RELEASE.**

More precisely, and this distinction matters: the Place module is **engineering-complete for
every surface reachable without infrastructure**, and **entirely unvalidated for every surface
that needs it**. Those are not the same as "nearly ready" — a module whose SQL has never
executed and whose guards have never denied a request has an unknown, not a small, remaining
risk.

The Place **workstream** classification remains **INCOMPLETE** and is unchanged by this
assessment. Closure is not available while DB-backed validation is absent and two contract
questions are unadjudicated; a closure assessment would fail on its own criteria today, which is
why this task deliberately did not attempt one.

## 11. Delivery-State Recommendation
No gate is upgraded. `implementation` and `testing` remain `in_progress` — accurate, since both
have real coverage and real missing pieces. `deployment`, `canary`, `hypercare` and
`stabilization` remain `not_started`. The one substantive state change is the consolidated risk
register in `workstreams/place.yaml`.

## 12. Selected PLACE-011 Task
Derived from §9 rather than guessed in advance. Items 1–3 are all **blocked on something outside
the repository** — an installer, a `git init` decision, and an absent owner — so none can be
scheduled as executable engineering work. The highest-priority item that is genuinely actionable
here is the **typing-precision cluster**, led by **F-18**: `PlaceCardRow.verification_status` is
typed `string` for a DB enum column, which forced an unchecked cast into `places.mapper.ts`
during PLACE-005. Removing that cast makes a boundary honest and is fully verifiable offline.

See `docs/delivery/tasks/PLACE-011.yaml`.

## 13. Explicit Non-Claims
This assessment does **not** claim any unverified: **production deployment, production migration
application, production backfill completion, complete external consumer migration, complete
cache propagation, complete search reindexing, complete event propagation, canary success,
hypercare completion, production stabilization, compatibility retirement readiness, or legacy
schema cleanup readiness.**

It further does not claim: that any SQL in the Place module is valid, that any migration
applies, that any guard enforces any declaration, that any audit event or revision persists,
that any index is used by the planner, that any consumer works at runtime, or that the Phú Quốc
bounding box is correct. It asserts only what §5's four commands and the cited reports actually
demonstrate. No product code was modified in producing it.
