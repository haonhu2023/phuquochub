# PLACE-017 — Execution Report (F-6 OpenAPI ↔ runtime alignment)

> Workstream: place · Task: PLACE-017 · Type: documentation · Date: 2026-07-23
> Authority: `docs/delivery/state.yaml`, `docs/delivery/tasks/PLACE-017.yaml`, decision **OD-F-6** (F6-A)
> Result: **COMPLETED.** AC1–AC10 (mandatory) PASS, AC11 (optional) PASS.
> **Zero runtime files changed.**

## 1. Executive summary

`GET /places` published three query parameters it rejects with **HTTP 400** and declared a
pagination envelope it does not emit. Documentation now matches runtime exactly, verified
mechanically rather than by eye: an automated contract check parses the accepted property names
straight out of `ListPlacesQueryDto` and asserts equality with the documented active set.

`status`, `sort` and `cursor` were **deprecated, not deleted** — OD-F-6 obligation 7, because
external consumers cannot be ruled out.

## 2. Authorization and dependency verification

| item | value |
|---|---|
| `state.yaml` `current.task` | **PLACE-017**, `status: ready` |
| Decision authority | `OWNER-DECISION-F-6.md` — OD-F-6, option **F6-A**, APPROVED 2026-07-23 |
| `depends_on` | **PLACE-016** — `status: completed` 2026-07-23, AC1–AC9 PASS |

## 3. Preflight — the accepted set re-derived, not copied

The task requires re-deriving from source rather than trusting the recorded matrix. From
`ListPlacesQueryDto` (`places.dto.ts:98-113`) the accepted set is exactly:

```
category, ward, price_range, page, limit
```

Two preflight results worth recording explicitly:

- **No Swagger/OpenAPI decorators exist anywhere in the codebase.** A repo-wide grep for
  `@nestjs/swagger`, `ApiProperty`, `ApiQuery`, `SwaggerModule` returns **nothing**. There is
  therefore no decorator layer to reconcile — a task obligation discharged by evidence of absence.
- **No generated contract artifact exists.** `find` returns a single `openapi.yaml`, hand-maintained
  and checked in. It is the only contract artifact, so "generated contract validates" reduces to
  "the checked-in document parses".

## 4. Parameter comparison matrix (final state)

| Parameter | OpenAPI | Runtime accepts | DTO validates | Default | Required | Allowed | Max | Min | Consumer | Mismatch |
|---|---|---|---|---|---|---|---|---|---|---|
| `category` | active, string | ✅ | `@IsString` | none | optional | any | — | — | web `listPlaces` | **none** |
| `ward` | active, string | ✅ | `@IsString` | none | optional | any | — | — | web `listPlaces` | **none** |
| `price_range` | active, `$ref PriceRange` | ✅ | `@IsEnum` | none | optional | free\|low\|mid\|high | — | — | web `listPlaces` | **none** |
| `page` | active, int | ✅ | `@IsInt @Min(1)` + `clampPage` | **1** | optional | ≥1 | — | 1 | web (unused) | **none** |
| `limit` | active, int | ✅ | `@IsInt @Min(1)` + `clampLimit` | **20** | optional | ≥1 | **100 (clamped)** | 1 | web sends 50 | **none** — clamp now documented |
| `status` | **deprecated** | ❌ 400 | absent | n/a | n/a | n/a | — | — | none in repo | documented as unimplemented |
| `sort` | **deprecated** | ❌ 400 | absent | n/a | n/a | n/a | — | — | none in repo | documented as unimplemented |
| `cursor` | **deprecated** | ❌ 400 | absent | n/a | n/a | n/a | — | — | none in repo | documented as unimplemented |
| *(response)* `meta` | timestamp/page/pageSize/total/totalPages | ✅ | `paginate()` | — | — | — | — | — | web ignores | **none** — was `limit`/`next_cursor` |

**Geographic filters:** `GET /places` accepts none, and the operation description now says so
explicitly, pointing to `/geo/nearby` and `/geo/bbox`.

**Sorting semantics:** fixed server-side `rating_avg DESC NULLS LAST, created_at DESC, id ASC`
(PLACE-004), with no client control — now documented on the operation.

**Pagination semantics:** offset-based `page`/`limit`; no cursor support — now documented.

## 5. Documentation changes

**`docs/api/openapi.yaml`**
- `listPlaces` gained an operation `description` stating published-only results, the fixed ordering,
  offset-only pagination, the HTTP 400 behaviour for unknown parameters, and the absence of geo filters.
- `category`/`ward`/`price_range` gained descriptions; `page`/`limit` were **inlined** (previously
  `$ref` to shared `PageParam`/`LimitParam`) so the clamp behaviour could be documented **without
  altering shared components other operations depend on**.
- `status`/`sort`/`cursor` retained with `deprecated: true` and a note stating each is unimplemented
  and returns **HTTP 400**, plus why (`status` = moderation privilege per GAP-02/04; `cursor` =
  parked GAP-05/10 needing ADR-010).
- `Meta` corrected to the emitted envelope; `next_cursor` and `quota_remaining` kept but marked
  `deprecated` with "not emitted"; the phantom `limit` field removed.

**`docs/api/api.md`**
- §6 gained a status banner and per-item ✅/❌ implementation markers: offset pagination and
  filtering are real; `cursor`, `sort`, `fields` are **not implemented** and return 400.
- §11 Place list request line corrected to the true accepted set, with the reason `status` is absent.

## 6. Files inspected

`state.yaml`; `tasks/PLACE-017.yaml`; `tasks/PLACE-016.yaml`; `findings/F-6.yaml`;
`decisions/OWNER-DECISION-F-6.md`; `places.dto.ts`; `places.controller.ts`; `places.service.ts`;
`places.repository.ts`; `common/pagination.ts`; `main.ts`;
`packages/shared-types/src/api-response.ts`; `place.enums.ts`;
`apps/web/src/modules/places/api/places.api.ts`; `docs/api/openapi.yaml`; `docs/api/api.md`.

## 7. Files modified

`docs/api/openapi.yaml` · `docs/api/api.md` — **documentation only**.

Governance artifacts updated separately: `tasks/PLACE-017.yaml`, `tasks/PLACE-018.yaml`,
`state.yaml`, `findings/F-6.yaml`, `workstreams/place.yaml`.

**No runtime file appears in the change set.** No DTO, controller, service, repository, pipe, type,
or spec was edited.

## 8. Files created

`docs/delivery/reports/PLACE-017-openapi-alignment-report.md`;
`docs/delivery/evidence/PLACE-017-openapi-alignment-evidence-index.md`.

## 9. Validation commands (copied literally from PLACE-017.yaml)

```
node -e "require('js-yaml').load(require('fs').readFileSync('docs/api/openapi.yaml','utf8'))"
cd apps/api && npx jest places
cd apps/api && npx tsc -p tsconfig.json --noEmit
```

Plus the contract check AC10 requires.

## 10. Validation results

| # | command | exit | result |
|---|---|---|---|
| 1 | openapi.yaml parse (js-yaml) | **0** | parses cleanly after editing |
| 2 | contract check (8 assertions) | **0** | **CONTRACT CHECK PASSED** |
| 3 | `npx jest places` | **0** | **105/105, 7 suites — identical to the pre-task count** |
| 4 | `npx tsc -p tsconfig.json --noEmit` | **0** | clean |

Command 3 is the AC9 evidence: the count is unchanged from PLACE-016's final state because no
runtime file and no spec was touched.

## 11. Contract-check output (AC10)

```
documented ACTIVE : category, limit, page, price_range, ward
runtime ACCEPTED  : category, limit, page, price_range, ward
[2] documented ACTIVE set == runtime ACCEPTED set    OK  exact match (5 params)
[3] status/sort/cursor deprecated + document HTTP 400 OK
[4] page default 1 / limit default 20, max 100, clamp documented  OK
[5] PriceRange enum matches place.enums.ts: free|high|low|mid     OK
[6] Meta = timestamp/page/pageSize/total/totalPages (+2 deprecated)  OK
[7] no geo filters documented on /places             OK
[8] no Swagger decorators exist to reconcile         OK
```

The check derives the runtime side by parsing `ListPlacesQueryDto`'s property names from source, so
it cannot drift into agreeing with a hand-written expectation.

## 12. Acceptance-criteria matrix

| # | Criterion | Mandatory | Result | Evidence |
|---|---|---|---|---|
| AC1 | Every implemented parameter documented | yes | **PASS** | contract check [2] |
| AC2 | Every documented ACTIVE parameter accepted by runtime | yes | **PASS** | contract check [2], derived from DTO source |
| AC3 | Defaults and max limits match (incl. clamp not rejection) | yes | **PASS** | contract check [4] |
| AC4 | Enum values match | yes | **PASS** | contract check [5], compared against `place.enums.ts` |
| AC5 | Geographic filters: states none exist on this endpoint | yes | **PASS** | operation description; contract check [7] |
| AC6 | Pagination and sorting semantics match | yes | **PASS** | operation description; `Meta` corrected; contract check [6] |
| AC7 | status/sort/cursor explicitly deprecated, not silently deleted | yes | **PASS** | contract check [3] |
| AC8 | Checked-in OpenAPI parses | yes | **PASS** | §10 cmd 1 |
| AC9 | Runtime unchanged | yes | **PASS** | zero runtime files in the change set; 105/105 unchanged |
| AC10 | Contract check shows documented == accepted | yes | **PASS** | §11 |
| AC11 | Meta divergence corrected, noted as carried under F-6 | **no** | **PASS** | §5; no separate finding id minted |

## 13. Compatibility assessment

- **Internal:** no impact. `places.api.ts` sends only the five active parameters and ignores `meta`.
- **Web consumers:** none affected — no runtime or shared-type change.
- **External API consumers:** **UNKNOWN and unverifiable.** No version control, deployment,
  telemetry, or client registry exists. Zero repository hits is **not** treated as proof of absence,
  which is precisely why the three parameters were deprecated rather than removed. Any external
  client that read the old spec and sent `status`/`sort`/`cursor` was **already** receiving HTTP 400;
  this task documents that reality rather than changing it.

## 14. Release-blocker reassessment for F-6

`findings/F-6.yaml` pre-committed four clearing conditions: openapi + api.md + Meta reconciled;
deprecation notes applied; a contract check proving documented == accepted; runtime provably
unchanged. **All four are met**, so `release_blocker_status` moves `OPEN → CLEARED` on
pre-committed evidence.

What is **not** claimed as resolved: the underlying product question of whether cursor pagination
and sorting *should* exist (GAP-05/10) stays parked, still needing ADR-010 to be accepted. This task
made the contract honest; it did not decide the roadmap.

## 15. Explicit non-claims

Not claimed: that any external consumer has been identified, contacted, or ruled out; that the
documented behaviour has been verified against a running server (no deployment, no HTTP-level test,
Docker absent); that the endpoint is release-ready. The alignment is proven **statically** —
documentation against DTO source — not by observing live request/response traffic.
