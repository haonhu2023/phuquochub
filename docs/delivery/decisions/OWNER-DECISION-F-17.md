# OD-F-17 — PlaceCard `status` and `score` decided independently

- **Decision ID:** OD-F-17
- **Related finding:** F-17 (openapi `PlaceCard` omits `status` and `score`)
- **Decision status:** **APPROVED**
- **Chosen option:** **F17-D** — treat `status` and `score` as separate dispositions
- **Owner:** Project Owner
- **Approval evidence:** owner instruction supplied in the "PLACE Owner Decision Approval — F-1, F-6, and F-17" session input, 2026-07-23. No individual approver name, job title, ticket, or meeting exists in repository context and none is asserted.
- **Decision date:** 2026-07-23
- **Review date:** not fixed — a future public `score` requires a separate decision

## Decision statement

`status` and `score` are decided independently. Their evidence differs materially and they must
not share a disposition.

### `status` — public exposure APPROVED, using the existing authoritative enum

A stable public publication-status vocabulary **already exists** and is **already part of the
published public contract**, so the owner's precondition ("include a public publication-status
field only when its semantics are explicitly defined; use the existing authoritative enum if one
already exists") is satisfied on the evidence below.

- Semantics: **publication / visibility state only.** It is explicitly **not** whether a business
  is currently open — operating hours are carried separately by `opening_hours`.
- Vocabulary: the existing authoritative enum `draft | pending | published | archived`. **No enum
  member is invented by this decision.**
- Net-new disclosure: **zero.** The same enum is already declared publicly as
  `PlaceStatus` and already applied to the public `Place` (detail) response.
- Public channels can only ever observe `published`, because public reads filter to it.

Obligation: document `status` on the openapi `PlaceCard` schema, matching what runtime already
emits. This is **additive documentation** — the emitted JSON does not change by a single byte.

**Residual concern recorded, not resolved:** `draft` and `pending` are moderation-workflow states,
and the same card shape is reused for privileged reads whose status filter is deliberately omitted
(recorded separately as F-24). Whether privileged and public cards should share one schema is an
access-control question, not a vocabulary question, and is **out of scope here**.

### `score` — public exposure on PlaceCard NOT APPROVED

- Public `PlaceCard` `score` is **not approved**.
- An undefined numeric score must not be published: no defined measure, no range, no stability
  guarantee (`ts_rank` varies with corpus and query), no null semantics, no statement on whether
  it is personalized or safe to expose.
- A future public score requires a **separate approved decision** defining meaning, range,
  stability, source, null behaviour, and personalization.

Evidence-established state, which determines the remediation direction:

- **OpenAPI does not document `score` on `PlaceCard`** → no documentation removal needed there.
- **Runtime never emits `score` through `PlaceCard`** → this is *not* live public leakage.
  `toPlaceCard` has exactly four call sites — `geo.service.ts:32`, `places.service.ts:59`, `:125`,
  `:167` — and **none supplies a score-bearing row**.
- `searchFullText` does return a `score`, but `SearchService.search` maps rows by hand into
  `{type, id, title, slug, score, snippet}` and openapi types `/search` as `SearchResult`, **not**
  `PlaceCard`.

Therefore the `score` portion of F-17 is **dead contract surface**, not leakage: it is declared in
`packages/shared-types/src/place.ts` (`score?: number`), in `PlaceCardRow`
(`places.repository.ts:28`), and in the mapper's conditional branch
(`places.mapper.ts:28-30`) — and reachable by nothing. Obligation: **remove those three
declarations**, in the same class of change PLACE-007 applied to `getCardBySlug`.

## Scope

The `PlaceCard` contract only. Explicitly out of scope: the `/search` `SearchResult` contract, the
`Place` detail schema, F-24, and F-6's list-parameter questions.

**Scope-boundary observation, carried forward and deliberately not acted on:**
`docs/api/openapi.yaml:1913-1921` publishes `SearchResult.score` as a bare `type: number` on the
public `/search` operation (`security: []`). That is an undefined numeric score already published
publicly. It falls outside F-17 (a different schema) and outside this decision, but it stands in
tension with the owner's general principle above and needs its own owner decision. **No finding
identifier is minted for it here.**

## Rationale

The two fields were bundled under one finding but their evidence points in opposite directions,
which is precisely why F17-D (decide them independently) was chosen over any single disposition.

`status` is a **documentation deficit**: the field is real, authoritative, non-null, already on the
wire, and its enum is already published publicly via the `Place` detail schema. Omitting it from
`PlaceCard` makes openapi internally inconsistent — the same field is documented on one public
schema and not on the other. Documenting it costs nothing and discloses nothing new.

`score` is the mirror image — a **declaration with no referent**. It is not leakage, because no
endpoint can produce it; it is dead surface that makes the shared type describe a payload that
cannot occur. Deleting it is the same class of change PLACE-007 applied to `getCardBySlug`, and it
avoids the trap the owner's decision names directly: publishing a numeric score nobody has defined.

Deciding both together would have forced one field into the wrong treatment — either inventing
semantics for `score` to keep it, or dropping `status` from the contract while runtime keeps
emitting it, which would leave the very mismatch F-17 exists to close.

## Alternatives considered

- **F17-A add both to openapi** — rejected for `score`: would require defining a number nobody has
  defined.
- **F17-B remove both from runtime** — rejected for `status`: it is real, authoritative, already
  publicly contracted on `Place`, and needed by moderation reads.
- **F17-C split public and internal card contracts** — deferred as premature: no second consumer
  exists yet. It remains the natural answer if F-24 forces the question.

## Evidence

| Field | Shared type | Emitted by API | In OpenAPI `PlaceCard` | Mapped | Web use | Tests |
|---|---|---|---|---|---|---|
| `status` | `PlaceStatusValue` | **always** (`CARD_COLS` selects `p.status`) | **absent** (present on `Place`) | `places.mapper.ts:22`, unconditional | none found | `places.mapper.spec.ts:16` |
| `score` | `score?: number` | **never via PlaceCard** | absent | `places.mapper.ts:28-30`, conditional | none | mapper spec "only adds when present" |

Sources: `packages/shared-types/src/place.ts`;
`apps/api/src/modules/places/repositories/places.repository.ts:9-29,82-87`;
`apps/api/src/modules/places/places.mapper.ts:10-32`;
`apps/api/src/modules/places/place.enums.ts`; `docs/api/openapi.yaml:1680,1754-1779,1913-1921`;
`apps/web/src/modules/places/types.ts` (pure re-export);
`docs/delivery/reports/PLACE-005-shared-types-report.md` (origin of F-17).

## Compatibility impact

- `status` documentation: **no consumer impact** — the payload is unchanged; this is additive
  documentation of a field already on the wire.
- `score` removal: **no internal consumer impact** — one mapper spec assertion is affected. The
  emitted JSON is unchanged, because no endpoint was emitting the field.
- External consumers: **unknown and unverifiable** (no VCS, no deployment, no telemetry). Zero
  repository hits is not treated as proof of no external consumer.

## Security impact

Mildly positive: documenting `status` ends an undeclared field on the public wire. No new
information is disclosed, since the enum is already public via `Place`.

## Data impact

None. No schema, migration, or stored data is involved.

## Operational impact

None.

## Implementation obligations

1. Add `status: $ref PlaceStatus` to the openapi `PlaceCard` schema. Payload must not change.
2. Remove `score` from `packages/shared-types/src/place.ts`, from `PlaceCardRow`, and from the
   `toPlaceCard` conditional branch.
3. Do **not** touch `SearchResult`, `SearchService`, or `searchFullText`'s `score` — the internal
   ranking score retains its defined ranking purpose inside the search module.
4. Do not expose internal moderation details beyond the already-published enum.

Recorded as **PLACE-018** (proposed, not activated).

## Validation obligations

`npx jest places` and `npx jest search` green; `apps/api` and `apps/web` `tsc --noEmit` exit 0;
mapper specs prove exact field behaviour; explicit confirmation that emitted JSON is byte-identical
for both changes; openapi parses.

## Rollback / reversal conditions

Two documentation/type edits, individually revertible. The `score` decision reverses only via a
separate approved decision defining the score.

## Finding state after this decision

`decision_status: APPROVED` · `implementation_status: PENDING` ·
`validation_status: PENDING` · `release_blocker_status: OPEN`
