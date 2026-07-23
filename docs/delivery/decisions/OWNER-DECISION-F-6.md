# OD-F-6 — OpenAPI list-query contract follows the validated runtime implementation

- **Decision ID:** OD-F-6
- **Related finding:** F-6 (openapi `listPlaces` vs implementation — GAP-05/10)
- **Decision status:** **APPROVED**
- **Chosen option:** **F6-A** — OpenAPI and related documentation follow the current validated runtime
- **Owner:** Project Owner
- **Approval evidence:** owner instruction supplied in the "PLACE Owner Decision Approval — F-1, F-6, and F-17" session input, 2026-07-23. No individual approver name, job title, ticket, or meeting exists in repository context and none is asserted.
- **Decision date:** 2026-07-23
- **Review date:** not fixed — reopens if an external consumer of a removed parameter is identified

## Decision statement

The current API implementation and its supported DTO behaviour are **the intended contract**,
unless repository evidence identifies an existing consumer that depends on a conflicting
OpenAPI-only parameter.

Required outcome:

1. update OpenAPI and related documentation to describe the query parameters runtime **actually**
   accepts;
2. remove **or deprecate** documentation-only parameters that are not supported;
3. document actual defaults, limits, allowed values, validation behaviour, sorting behaviour,
   geographic filters, and pagination semantics;
4. **preserve currently supported runtime behaviour**;
5. do **not** add unused runtime features solely to match stale documentation;
6. assess backward compatibility for external consumers **before** deleting a previously
   published parameter;
7. use an **explicit deprecation note** wherever external consumer usage cannot be ruled out.

## Scope

`GET /places` query parameters and the pagination envelope it returns. It does **not** authorise
any runtime change, and it does **not** settle the separate keyset/cursor question beyond
documenting that cursor pagination is not implemented.

## Rationale

The mismatch is not documentation drift — it is a hard, consumer-visible failure. `main.ts:20`
configures `new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })`,
so `status`, `sort`, and `cursor` — all three published in `docs/api/openapi.yaml:461-471` **and**
in `docs/api/api.md:182` — are **rejected with HTTP 400**, not ignored.

Implementing them instead of documenting reality was rejected because of `status` specifically:
`apps/api/src/modules/places/places.service.ts:49-50` deliberately does not forward `status` to
the repository, because status filtering is a moderation privilege. That omission is the GAP-02/04
security fix, pinned by regression specs in PLACE-008 and PLACE-009. Publishing a public
`status` filter under `security: []` would reverse it.

## Alternatives considered

- **F6-B implementation follows OpenAPI** — rejected: would reintroduce the GAP-02/04 exposure
  for `status`, and would require building cursor pagination and a sort whitelist that no known
  consumer requests.
- **F6-C versioned compatibility transition** — unavailable: ADR-010 (API Versioning) is
  `Proposed`, not `Accepted`, in `docs/99-decisions/decision-register.md`, so the project has no
  agreed versioning mechanism to express such a transition.
- **F6-D narrow the contract without compatibility assessment** — rejected: obligation 6 above
  requires the assessment first.

## Evidence

Field-by-field state at the time of this decision:

| Parameter | OpenAPI | Runtime | Actual default | Validation behaviour | Classification |
|---|---|---|---|---|---|
| `category` | string | `@IsOptional @IsString` | none | passes | match |
| `ward` | string | `@IsOptional @IsString` | none | passes | match |
| `price_range` | `$ref PriceRange` | `@IsEnum(PriceRange)` | none | 422 on bad enum | match |
| `page` | integer, min 1, default 1 | `@IsInt @Min(1)` + `clampPage` | 1 | 422 if < 1 | match |
| `limit` | integer, min 1, **max 100**, default 20 | `@IsInt @Min(1)` + `clampLimit(20, 100)` | 20 | > 100 **silently clamped**, not rejected | partial |
| `status` | `$ref PlaceStatus` | **absent from DTO** | n/a (repo hard-defaults `published`) | **HTTP 400** | breaking |
| `sort` | `SortParam` `field_asc\|field_desc` | **absent** | n/a (fixed `rating_avg DESC NULLS LAST, created_at DESC, id ASC` — PLACE-004) | **HTTP 400** | breaking |
| `cursor` | `CursorParam` string | **absent** | n/a (offset only) | **HTTP 400** | breaking |
| response `meta` | `page, limit, total, next_cursor, quota_remaining` | `page, pageSize, total, totalPages, timestamp` | — | — | undocumented divergence |

Sources: `docs/api/openapi.yaml:461-471,1568-1584,1651-1658`; `docs/api/api.md:62-63,182`;
`apps/api/src/modules/places/dto/places.dto.ts:98-113`;
`apps/api/src/modules/places/places.controller.ts` (`list`);
`apps/api/src/modules/places/places.service.ts:47-60`;
`apps/api/src/common/pagination.ts`;
`packages/shared-types/src/api-response.ts:32-42`; `apps/api/src/main.ts:20`.

Consumer evidence: the only in-repository client,
`apps/web/src/modules/places/api/places.api.ts`, sends `category`, `ward`, `price_range`, `page`,
`limit` only — **no** use of `status`, `sort`, or `cursor`, and it ignores `meta` entirely.

The `meta` divergence is recorded here as an observation carried under F-6. It is **not** assigned
a new finding identifier by this decision.

## Compatibility impact

Internal: **no consumer impact**. External: **unknown and unverifiable** — the repository is not
under version control, has no deployment, no telemetry, no access log, and no client registry.
Zero repository search hits are therefore **not** treated as evidence that no external consumer
exists. Obligation 7 (explicit deprecation note rather than silent deletion) applies to `status`,
`sort`, and `cursor` for exactly this reason.

## Security impact

Positive: the documentation stops advertising a public `status` filter over unpublished Places
that the implementation deliberately refuses to provide.

## Data impact

None. Documentation only.

## Operational impact

None at runtime. Obligation 4 forbids behaviour change.

## Implementation obligations

1. Reconcile `docs/api/openapi.yaml` `listPlaces` with the accepted parameter set.
2. Reconcile `docs/api/api.md` §5 and §11 where they state cursor/sort/status for Place list.
3. Reconcile the `Meta` schema with the emitted envelope.
4. Mark `status`, `sort`, `cursor` **deprecated with an explicit note** rather than deleting
   silently, unless consumer evidence permits removal.
5. Document the `limit` clamp behaviour (values > 100 are capped, not rejected).
6. No Swagger decorators exist in the codebase to reconcile — the OpenAPI document is
   hand-maintained and checked in, not generated. Verify this before assuming otherwise.
7. **Change no runtime behaviour.**

Recorded as **PLACE-017** (proposed, not activated).

## Validation obligations

OpenAPI must parse; the documented parameter set must equal the DTO's accepted set; a
contract-focused check comparing the two; `tsc --noEmit`; existing places specs pass unmodified
(they must, since no runtime code changes).

F-6 is **not** resolved until documentation, the checked-in contract, and validation evidence
agree.

## Rollback / reversal conditions

Revert the documentation edits; no code or data is involved. This decision reverses if an external
consumer depending on `status`, `sort`, or `cursor` is identified.

## Finding state after this decision

`decision_status: APPROVED` · `implementation_status: PENDING` ·
`validation_status: PENDING` · `release_blocker_status: OPEN`
