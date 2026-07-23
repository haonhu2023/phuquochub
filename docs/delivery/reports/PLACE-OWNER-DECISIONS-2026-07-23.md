# Owner Decision Approval Gate — F-1, F-6, F-17

> Workstream: place · Type: governance (decision recording) · Date: 2026-07-23
> Authority: owner instruction supplied in session; `docs/delivery/state.yaml`; ADR-DELIVERY-001
> Result: **COMPLETED** — three decisions recorded as APPROVED. **No finding resolved.**
> **No production code, test, migration, shared type, OpenAPI source, or generated output was modified.**

## 1. What this gate did and did not do

It converted three explicit owner decisions into repository records, updated the three findings to
a four-part state that keeps "decided" separate from "done", and derived three bounded remediation
tasks **without activating any of them**.

It did **not** implement anything, did **not** resolve any finding, and did **not** change the
active task. All three findings remain BLOCKS_RELEASE.

## 2. Preflight (all eight checks passed)

| # | Check | Result |
|---|---|---|
| 1 | F-1, F-6, F-17 still exist and unresolved | PASS — all three carried as BLOCKS_RELEASE by PLACE-010 and reconfirmed against source |
| 2 | Supplied options match the decision package | PASS — F1-C, F6-A, F17-D are all documented options |
| 3 | No later repository decision supersedes them | PASS — `docs/delivery/decisions/` held only ADR-DELIVERY-001 (delivery execution control, unrelated); `docs/99-decisions/decision-register.md` has no entry for any of the three |
| 4 | Governance permits recording | PASS — owner approval is exactly the authority that was previously missing |
| 5 | Schema and naming convention identified | PASS with a caveat — see §3 |
| 6 | Task derivation permitted | PARTIAL — derivation yes, **activation no**; see §7 |
| 7 | Enums/DTOs/schemas/validators re-inspected | PASS — re-read from source, not from the prior package |
| 8 | Approval ≠ completion | PASS — enforced by the four-field finding state |

## 3. Naming-convention caveat

No owner-decision convention pre-existed. `docs/delivery/decisions/` contained only
ADR-DELIVERY-001, whose own scope line reads *"Delivery execution control only"* — so extending
that series to product and contract decisions would have mislabelled them. The
`OWNER-DECISION-<F-id>.md` convention with IDs `OD-F-n` was **established by this gate** and is
flagged in `state.yaml` for ratification or renaming by the owner.

Likewise `docs/delivery/findings/` did not exist and was created here. Its README states plainly
that it holds **only** findings with recorded owner decisions and is **not** a complete register —
every other finding stays in `workstreams/place.yaml`, the reports, and the evidence indexes.

## 4. Decisions recorded

| ID | Finding | Option | Status | Remediation |
|---|---|---|---|---|
| OD-F-1 | F-1 | F1-C | APPROVED | PLACE-016 |
| OD-F-6 | F-6 | F6-A | APPROVED | PLACE-017 |
| OD-F-17 | F-17 | F17-D | APPROVED | PLACE-018 |

Owner recorded as **Project Owner**; approval source **owner instruction**, 2026-07-23. No
individual name, job title, ticket, meeting, backdated timestamp, geographic authority, or
external-consumer confirmation is asserted anywhere.

## 5. Facts re-verified before recording

Recording a decision that the code cannot support would be worse than recording none, so each was
re-checked against source:

- **F-1** — the six enforcement points (`places.dto.ts:22,25`; `geo.dto.ts:10,13,28,31,34,37`) and
  the absence of any other enforcement (no `CHECK` on `places.location`, no service check, no seed
  validation) were re-confirmed. The constants are unchanged and stay PROVISIONAL.
- **F-6** — `main.ts:20` `forbidNonWhitelisted: true` confirms the mismatch is **HTTP 400**, not
  silent tolerance. `places.service.ts:49-50` confirms the `status` omission is the deliberate
  GAP-02/04 security fix, which is why F6-B was the wrong direction.
- **F-17 `status`** — a stable public publication-status enum **does** exist (`PlaceStatus`,
  openapi `:1680`) and is **already** applied to the public `Place` detail schema (`:1778`). Net-new
  disclosure from documenting it on `PlaceCard` is therefore zero, and the payload does not change.
  So the owner's precondition is met and the "omit pending semantics" fallback did **not** apply.
- **F-17 `score`** — all four `toPlaceCard` call sites (`geo.service.ts:32`,
  `places.service.ts:59/:125/:167`) were swept: **none** supplies a score-bearing row, and openapi
  never documented it on `PlaceCard`. This is dead surface, **not** live leakage, which determines
  the remediation direction recorded.

## 6. Findings after this gate — none resolved

| Finding | decision_status | implementation_status | validation_status | release_blocker_status |
|---|---|---|---|---|
| F-1 | APPROVED | PENDING | PENDING | **OPEN** |
| F-6 | APPROVED | PENDING | PENDING | **OPEN** |
| F-17 | APPROVED | PENDING | PENDING | **OPEN** |

Interim state for all three: **APPROVED FOR REMEDIATION**.

## 7. Task derivation and the activation decision

Three tasks were written at the next unused identifiers — verified by listing
`docs/delivery/tasks/`, not by arithmetic: **PLACE-016**, **PLACE-017**, **PLACE-018**.

**None was activated.** `state.yaml` carries a single `current.task`, and **PLACE-015** already
holds it under an existing authorization. Activating a derived task would create a second active
task and would override an authorized order that Phase 6 explicitly protects. The owner's
recommended priority (F-1 → F-6 → F-17) is preserved instead as a sequencing chain:
PLACE-016 → PLACE-017 → PLACE-018, each depending on the previous, with PLACE-016 depending on
PLACE-015. Those dependencies are **sequencing, not technical**, and are labelled as such in each
file.

## 8. Scope-boundary observation carried forward

`docs/api/openapi.yaml:1913-1921` publishes `SearchResult.score` as a bare `type: number` on the
public `/search` operation (`security: []`) — an undefined numeric score that **is** already
published publicly. It sits outside F-17 (a different schema) and outside OD-F-17, but it stands in
tension with the owner's "do not publish an undefined numeric score" principle. It is recorded in
`findings/F-17.yaml` as a scope-boundary observation. **No new finding identifier was minted**, and
no action was taken.

## 9. Validation

Nine YAML files parse; three decision records carry 18/18 required sections; three finding records
carry all four state fields with the intended values and resolve every referenced artifact; three
task files carry all 20 required keys with existing dependency files; 18 task IDs and 3 decision
IDs with **zero duplicates**; state consistency confirms `current.task` is still PLACE-015 and all
three derived tasks are `proposed`; relative markdown links resolve. **ALL CHECKS PASSED, exit 0.**

No production unit tests were run — no implementation code was changed, so there was no factual
claim requiring them.

## 10. Explicit non-claims

This gate does **not** claim: any finding resolved; any release blocker cleared; production
readiness; that the Phú Quốc boundary is authoritative; that any external API consumer has been
identified or ruled out; that database, migration, HTTP, authorization, geospatial, or deployment
behaviour has been verified. Docker remains absent and the repository remains outside version
control, so none of that is provable here.
