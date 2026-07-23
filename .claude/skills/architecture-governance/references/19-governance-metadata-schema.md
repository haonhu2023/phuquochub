# Architecture Governance — Governance Metadata Schema

> **Scope.** This reference is the **canonical data model** for every governance
> artifact the skill produces or reads: ADRs, Decision Register entries, ACRs,
> exceptions, waivers, technical-debt items, drift findings, cross-domain
> dependency entries, release/sprint approval records, audit findings, and
> maturity assessments. It defines the fields, their types, their allowed values,
> their relationships, their identifiers, and the integrity rules that make the
> whole governance record queryable, traceable, and auditable.
>
> **Read-only contract.** A schema *describes* the shape of data; it does not
> create data. This document is used to *validate* an artifact, to *read* a field
> correctly, and to *instantiate a template* — but only when the user explicitly
> asks for an artifact to be recorded (per `SKILL.md` §2). No schema here produces
> code, database migrations, or DDL; the schema is expressed declaratively and the
> *implementation* of any store is a delivery-line concern, out of scope.
>
> **Relationship to the rest of the skill.** This schema is the *connective
> tissue*. Every `templates/*` file is an instantiation of a schema defined here;
> every `references/00`–`18` process reads and writes fields defined here;
> `references/03` (Decision Register governance) governs the *integrity* of the
> data whose *shape* this file defines; `references/17` (audit) tests conformance
> to these schemas; `references/18` (decision trees) routes on values of these
> fields; and `references/15` (glossary) names the vocabulary these fields draw on.

---

## Table of contents

1. Purpose — why a shared schema
2. Design principles for governance metadata
3. Cross-cutting field conventions (types, formats, nullability)
4. Identifier scheme (the ID grammar for every artifact)
5. The common envelope (fields every artifact shares)
6. Controlled vocabularies (the enumerations)
7. The relationship model (how artifacts link)
8. Entity schemas — the twelve governance artifacts
   - 8.1 ADR
   - 8.2 Decision Register entry
   - 8.3 Architecture Change Request (ACR)
   - 8.4 Exception
   - 8.5 Waiver
   - 8.6 Technical-debt item
   - 8.7 Drift finding
   - 8.8 Cross-domain dependency entry
   - 8.9 Release architecture approval record
   - 8.10 Sprint architecture approval record
   - 8.11 Audit finding
   - 8.12 Maturity assessment
9. State-model metadata (encoding lifecycle in data)
10. Provenance, authorship, and the immutable trail
11. Integrity constraints and validation rules
12. Traceability graph and referential integrity
13. Versioning and schema evolution
14. Retention, classification, and privacy
15. Query patterns the schema must support
16. Anti-patterns in governance metadata
17. Worked example — a linked record set
18. Integration with the operating model
19. Appendix A — field-type reference
20. Appendix B — controlled-vocabulary master list
21. Appendix C — JSON/YAML shape examples (illustrative, non-normative)
22. Appendix D — glossary deltas

---

## 1. Purpose — why a shared schema

Governance produces many *kinds* of records, authored by many people, over many
years. Without a shared schema each kind drifts into its own idiosyncratic shape,
and the organization loses the one thing governance exists to provide: the ability
to answer, *with data*, questions like —

- *"Show every S1 item, of any type, currently open against the Payments baseline
  and who owns each."*
- *"Trace this running component back through its drift finding, its waiver, the
  ADR that authorized the original design, and the ACR that last changed it."*
- *"List every exception expiring in the next 30 days and its remediation status."*
- *"What is our ADR coverage, exception aging, and drift rate this quarter?"*
  (the KPIs of `references/14`, computable only if the fields exist and are
  consistent).

Every one of these questions is *unanswerable* unless the underlying artifacts
share identifiers, controlled vocabularies, and relationship fields. The schema is
what turns a pile of documents into a **governance knowledge graph**.

> **The schema is the precondition for maturity Level 3+ and for auditability.**
> `references/16` credits standardization only when artifacts are consistent across
> domains; `references/17` can only trace and reconcile records that share a schema.
> This file is therefore load-bearing for the entire skill.

---

## 2. Design principles for governance metadata

1. **One shape per artifact type, org-wide.** A drift finding in Payments and one
   in Identity have identical structure. Local extensions are additive namespaced
   fields, never redefinitions of the core (§13.3).
2. **Every artifact is addressable.** Each has a globally unique, human-readable,
   immutable identifier (§4). Nothing governance-significant is anonymous.
3. **Relationships are first-class.** Links between artifacts are typed fields with
   referential integrity (§7, §12), not prose mentions. "This waiver covers that
   drift" is a field, not a sentence.
4. **Controlled vocabularies over free text** wherever a value drives a decision or
   a metric. Severity, status, scope, and authority are enumerations (§6); free
   text is reserved for human rationale.
5. **State lives in data.** Lifecycle state is a field with a defined transition
   model and a transition history (§9), so the current state and how it was reached
   are both queryable.
6. **Provenance is mandatory and immutable.** Who, when, under what authority — on
   every artifact and every state transition (§10). Unattributed governance data is
   unauditable and therefore worthless.
7. **Time is explicit and absolute.** All dates are absolute timestamps (§3.4);
   "expires in a quarter" is stored as a date, never a relative phrase.
8. **The schema is declarative and store-agnostic.** It defines *what* the data is,
   not *how* it is stored. Choosing a database or building a tool is out of scope
   (read-only contract).
9. **Nullable is a deliberate signal.** A field is required, conditionally
   required, or optional — and "conditionally required" states the condition
   (§3.3). Silent nulls are forbidden on required fields (§11).
10. **Schema evolution is governed** like any other governance artifact — versioned,
    backward-compatible where possible, ARB-approved (§13).

---

## 3. Cross-cutting field conventions

### 3.1 Notation used in this document

Each field is specified as:

```
field_name : type [cardinality] {required|cond-required(<cond>)|optional}
    — description; allowed values or vocabulary reference.
```

- **type** — one of the field types in Appendix A (string, enum, id-ref, timestamp,
  actor-ref, decimal, boolean, markdown, list<T>, etc.).
- **cardinality** — `[1]` single, `[0..1]` optional single, `[1..*]` one-or-more,
  `[0..*]` zero-or-more.
- **requirement** — required, conditionally required (with the condition), or
  optional.

### 3.2 Naming conventions

- Field names are `snake_case`, lower-case, ASCII.
- Enumeration values are `UPPER_SNAKE_CASE`.
- Identifiers follow the ID grammar (§4).
- Boolean fields are named as positive assertions (`is_time_boxed`,
  `blocks_release`), never negations.

### 3.3 Nullability semantics

- **Required** — must be present and non-empty at creation. Validation fails
  otherwise (§11).
- **Conditionally required** — required when a stated condition holds (e.g.,
  `expiry_date` is required *when* `is_time_boxed = true`). The condition is part
  of the schema and is validated.
- **Optional** — may be absent; absence carries no implied value.
- **Never** use a sentinel string ("N/A", "TBD", "-") to fill a required field.
  If a required value is genuinely unknown, the artifact is not yet valid and
  cannot be recorded — surface the gap (mirrors decision-tree §19 "cannot route
  until X").

### 3.4 Dates and time

- All timestamps are absolute, timezone-qualified, ISO-8601
  (`2026-07-16T14:03:00Z`).
- Relative expressions ("next quarter", "in 90 days") are resolved to absolute
  dates *at recording time* and stored absolutely (consistent with the memory rule
  that relative dates are converted to absolute).
- Every artifact has `created_at`; state transitions each carry a `transitioned_at`
  (§9).

### 3.5 Text fields

- `string` — short, single-line, length-bounded, no markup.
- `markdown` — long-form human rationale; may contain structure but no executable
  content. Rationale fields are `markdown`.
- Free text never carries decision-driving values that belong in an enum (§2.4).

### 3.6 Actors

- People and bodies are referenced by a stable **actor-ref** (a role or identity
  handle), never a bare display name, so authority checks and audit trails survive
  personnel changes (§10.2). Display names are derived, not stored as the key.

---

## 4. Identifier scheme (the ID grammar)

Every governance artifact has an immutable ID with this grammar:

```
<TYPE>-<SCOPE>-<SEQ>[.<SUBSEQ>]

TYPE   := ADR | DRE | ACR | EXC | WVR | DEBT | DRIFT | XDEP | REL | SPR | AUD | MAT
SCOPE  := an uppercase domain/portfolio code (e.g., PAY, IDN, PLAT) or ORG for
          organization-wide artifacts
SEQ    := a zero-padded monotonically increasing integer within TYPE+SCOPE
SUBSEQ := optional dotted sub-identifier for child artifacts (e.g., an audit
          finding within an audit: AUD-PAY-0007.03)
```

**Examples**

| ID | Meaning |
| --- | --- |
| `ADR-PAY-0042` | The 42nd ADR in the Payments domain. |
| `DRE-PAY-0042` | The Decision Register entry mirroring `ADR-PAY-0042`. |
| `ACR-ORG-0011` | The 11th org-wide Architecture Change Request. |
| `EXC-IDN-0007` | The 7th exception in Identity. |
| `WVR-ORG-0003` | The 3rd org-wide (S1) waiver. |
| `DRIFT-PAY-0130` | The 130th drift finding in Payments. |
| `AUD-PAY-0007.03` | The 3rd finding of the 7th Payments audit. |

**ID rules**

1. **Immutable.** An ID is never reused, reassigned, or deleted — even if the
   artifact is rejected or retired. Rejected artifacts keep their ID with status
   `REJECTED` (the sequence is never "reclaimed").
2. **Globally unique.** `TYPE`+`SCOPE`+`SEQ` is unique across all time.
3. **Human-readable and stable.** IDs appear in prose, links, and audit trails; a
   change to an ID breaks traceability and is forbidden.
4. **Scope reflects ownership, not location.** `SCOPE` is the *owning* domain
   (`references/04`), not where a file happens to live.
5. **Cross-references use IDs, never titles.** Titles change; IDs do not (§7).

---

## 5. The common envelope (fields every artifact shares)

Every governance artifact — regardless of type — carries this **common
envelope**. Type-specific fields (§8) are *added* to it.

```
id                : id            [1] required
    — the artifact's immutable identifier (§4).
artifact_type     : enum          [1] required
    — one of the TYPE codes (§4); redundant with the ID prefix for query ease.
title             : string        [1] required
    — concise human title; mutable; never used as an identifier.
summary           : markdown      [1] required
    — one-paragraph human summary of what this artifact is and why it exists.
scope             : enum          [1] required
    — the owning domain/portfolio code, or ORG (§4, VOCAB-SCOPE §6).
severity          : enum          [0..1] cond-required(if the type carries severity)
    — S1|S2|S3|S4 (VOCAB-SEVERITY §6); required for ACR, EXC, WVR, DEBT, DRIFT,
      AUD; derived/absent for pure records.
status            : enum          [1] required
    — the current lifecycle state, from the type's state model (§9).
owner             : actor-ref     [1] required
    — the accountable owner (references/04); the single throat to choke.
authority         : actor-ref     [0..1] cond-required(if a decision was made)
    — the authority that ratified the current status (references/00/13); required
      once the artifact reaches a decided state.
created_at        : timestamp     [1] required
    — absolute creation time (§3.4).
created_by        : actor-ref     [1] required
    — who authored the artifact.
updated_at        : timestamp     [1] required
    — absolute time of the last change (any field).
schema_version    : string        [1] required
    — the version of THIS schema the artifact conforms to (§13).
classification    : enum          [1] required
    — data sensitivity (VOCAB-CLASSIFICATION §6); drives retention/access (§14).
links             : list<link>    [0..*] optional
    — typed relationships to other artifacts (§7).
tags              : list<string>  [0..*] optional
    — free-form labels for search; never decision-driving.
provenance        : provenance    [1] required
    — the immutable authorship/transition record (§10).
```

> **The envelope is what makes cross-type queries possible.** "Every open S1 in
> Payments" is a filter on `severity`, `status`, and `scope` across *all*
> artifact types — feasible only because those fields exist identically everywhere.

---

## 6. Controlled vocabularies (the enumerations)

These are the canonical enumerations. Values are `UPPER_SNAKE_CASE`. The master
list is in Appendix B; the decision-relevant ones:

### VOCAB-SEVERITY
`S1_CRITICAL | S2_MAJOR | S3_MINOR | S4_INFORMATIONAL`
— per `SKILL.md` §7 / `references/15`. Drives gates, authority, and precedence.

### VOCAB-SCOPE
`ORG | <domain codes>` (e.g., `PAY | IDN | PLAT | …`). The domain registry is
governed by `references/04` (ownership). A scope value must exist in that registry
(referential rule §11).

### VOCAB-CLASSIFICATION
`PUBLIC_INTERNAL | CONFIDENTIAL | RESTRICTED | SECRET`
— data sensitivity; drives access and retention (§14).

### VOCAB-AUTHORITY-LEVEL
`DOMAIN_OWNER | ARB | CHIEF_ARCHITECT | CTO | EMERGENCY_DELEGATE`
— the authority tiers of `references/00` §6 and decision-tree Tree C.

### VOCAB-DISPOSITION (drift)
`REMEDIATE | WAIVE | PROMOTE_TO_CHANGE | FALSE_POSITIVE`
— the only legitimate drift dispositions (Tree F; silent-accept is absent by
design).

### VOCAB-LINK-TYPE
`SUPERSEDES | SUPERSEDED_BY | AMENDS | REFINES | DERIVES_FROM | COVERS |
COVERED_BY | AUTHORIZES | AUTHORIZED_BY | BREACHES | REMEDIATES | PROMOTES |
DEPENDS_ON | BLOCKS | RELATES_TO | EVIDENCED_BY | FINDING_OF`
— the typed relationship vocabulary (§7).

### Per-type STATUS vocabularies
Each artifact's `status` draws from its own state model (§8, §9). Summary:

| Type | Status vocabulary |
| --- | --- |
| ADR | `PROPOSED | ACCEPTED | SUPERSEDED | DEPRECATED | REJECTED | RETIRED` |
| ACR | `RAISED | TRIAGED | UNDER_REVIEW | APPROVED | REJECTED | DEFERRED | IMPLEMENTED | VERIFIED | CLOSED` |
| Exception | `REQUESTED | GRANTED | DENIED | ACTIVE | EXPIRED | RENEWED | REVOKED | REMEDIATED` |
| Waiver | (as Exception, always `S1_CRITICAL`, always time-boxed) |
| Debt | `IDENTIFIED | ACCEPTED | SCHEDULED | IN_PAYDOWN | DEFERRED | RETIRED` |
| Drift | `DETECTED | CONFIRMED | CLASSIFIED | IN_DISPOSITION | CLOSED` |
| Dependency | `PROPOSED | CONTRACTED | ACTIVE | DEPRECATED | RETIRED | BLOCKED` |
| Release approval | `PENDING | EVIDENCE_INCOMPLETE | GO | CONDITIONAL_GO | NO_GO` |
| Sprint approval | `PENDING | PASS | CONDITIONAL_PASS | ESCALATED | FAIL` |
| Audit finding | `OPEN | RESPONSE_AGREED | IN_REMEDIATION | REMEDIATION_ASSERTED | FOLLOW_UP | CLOSED | REOPENED` |
| Maturity assessment | `DRAFT | SCORED | REVIEWED | ISSUED | STALE` |

---

## 7. The relationship model (how artifacts link)

Relationships are stored as typed `link` objects in the envelope's `links` list:

```
link:
  type        : enum   [1] required   — VOCAB-LINK-TYPE (§6).
  target_id   : id     [1] required   — the ID of the linked artifact (§4).
  note        : string [0..1] optional — human clarification.
```

### 7.1 Link semantics and inverses

Many link types are **paired inverses**; the schema requires the inverse to exist
on the target (referential integrity, §12):

| Forward | Inverse | Meaning |
| --- | --- | --- |
| `SUPERSEDES` | `SUPERSEDED_BY` | An ADR replaces an earlier ADR. |
| `AUTHORIZES` | `AUTHORIZED_BY` | An ADR/ACR authorizes a design element. |
| `COVERS` | `COVERED_BY` | A waiver/exception covers a drift/deviation. |
| `REMEDIATES` | (self-directional) | A change/finding remediates a drift/debt. |
| `PROMOTES` | (to a change) | A drift promoted to a baseline change. |
| `DEPENDS_ON` | `BLOCKS`/(reverse) | A cross-domain dependency. |
| `FINDING_OF` | (parent audit) | An audit finding belongs to an audit. |
| `EVIDENCED_BY` | — | Points to supporting evidence (a record/measurement). |

### 7.2 The canonical link chains

Certain chains recur and are semantically required for traceability:

- **Decision provenance:** `DRE-*` `DERIVES_FROM` `ADR-*` — every register entry
  points to its ADR; every ADR that is registered has a mirroring DRE (§8.2).
- **Change provenance:** `ACR-*` `AUTHORIZES` a baseline element; the resulting
  decision is an `ADR-*` linked `DERIVES_FROM` the ACR.
- **Drift resolution:** `DRIFT-*` disposition creates exactly one of:
  `COVERED_BY` a `WVR/EXC` (waive), `REMEDIATES` link from a directive/ACR
  (remediate), or `PROMOTES` to an `ACR/ADR` (promote). The absence of any of
  these on a non-`FALSE_POSITIVE` drift is an integrity violation (§11) — it means
  drift was silently accepted, which the schema forbids by construction.
- **Waiver cover:** every `WVR/EXC` with status `ACTIVE` must `COVER` at least one
  thing (a drift, a control deviation) — a waiver covering nothing is invalid.
- **Audit finding:** every `AUD-*.NN` is a `FINDING_OF` its parent `AUD-*`.

> **Traceability by construction.** Because these chains are *required fields*, the
> knowledge graph is connected by design — you can always walk from a running
> component to the governance decisions that shaped it, and audit (`references/17`)
> can always trace and vouch (§10.3 there) using these links.

---

## 8. Entity schemas — the twelve governance artifacts

Each schema below = the common envelope (§5) **plus** the type-specific fields.

### 8.1 ADR (`ADR-*`)

```
context           : markdown  [1] required — the forces and situation.
decision          : markdown  [1] required — what was decided (the ruling).
options_considered: list<option> [1..*] required — each with pros/cons; ≥2.
consequences      : markdown  [1] required — resulting trade-offs, positive & negative.
decision_drivers  : list<string> [1..*] required — the criteria that drove it.
significance      : enum      [1] required — ARCHITECTURALLY_SIGNIFICANT (always, by
                                             definition of being an ADR).
supersedes        : id-ref    [0..1] optional — prior ADR replaced (link SUPERSEDES).
review_date       : timestamp [0..1] optional — when to revisit the decision.
```
State model: §6 ADR row. Authority: Tree C. Register mirror: an ADR that is
`ACCEPTED` requires a `DRE-*` entry (§8.2).

### 8.2 Decision Register entry (`DRE-*`)

```
decision_id       : id-ref    [1] required — DERIVES_FROM the ADR (§7.2).
decision_statement: string    [1] required — the decision in one sentence.
decided_on        : timestamp [1] required — when the decision became ACCEPTED.
decided_by        : actor-ref [1] required — the ratifying authority.
affects_baseline  : boolean   [1] required — does it change a frozen baseline?
baseline_refs     : list<id-ref> [0..*] cond-required(if affects_baseline) —
                                          the baseline elements affected.
```
The register entry is the *indexed, queryable* face of an ADR; `references/03`
governs its integrity. The register is complete iff every `ACCEPTED` ADR has
exactly one `DRE`.

### 8.3 Architecture Change Request (`ACR-*`)

```
change_description: markdown  [1] required — what changes and why.
baseline_diff     : markdown  [1] required — explicit diff vs. the frozen baseline.
baseline_refs     : list<id-ref> [1..*] required — baseline elements touched.
blast_radius      : enum      [1] required — CONTAINED | CROSS_DOMAIN | SYSTEMIC.
is_emergency      : boolean   [1] required — emergency change path? (Tree C-QC5).
rollback_plan     : markdown  [1] required — how to reverse if it fails.
verification       : markdown [0..1] cond-required(if status ≥ IMPLEMENTED) —
                                          how conformance was verified.
resulting_adr     : id-ref    [0..1] cond-required(if APPROVED) — the ADR recording
                                          the decision (DERIVES_FROM).
```
State model: §6 ACR row. Authority: cross-domain/baseline ⇒ ARB+ (Tree C).

### 8.4 Exception (`EXC-*`)

```
deviation_from    : id-ref    [1] required — the baseline element/control deviated.
rationale         : markdown  [1] required — why the deviation is justified.
is_time_boxed     : boolean   [1] required — MUST be true to be grantable (§8.5 for
                                             waivers); open-ended is invalid.
expiry_date       : timestamp [1] cond-required(if is_time_boxed) — absolute expiry.
conditions        : list<string> [1..*] required — conditions of the grant.
remediation_plan  : markdown  [1] required — how the deviation will end.
renewal_count     : integer   [1] required — times renewed; drives promote rule
                                             (Tree E-QE5).
covers            : list<id-ref> [1..*] cond-required(if status ACTIVE) — what it
                                             covers (link COVERS).
requester         : actor-ref [1] required — who asked (MUST differ from authority).
```
Integrity: `requester ≠ authority` (self-approval guard, §11). Expiry in the past
with status `ACTIVE` is an integrity violation → should be `EXPIRED`.

### 8.5 Waiver (`WVR-*`)

Same fields as Exception, with hard constraints:
```
severity          : always S1_CRITICAL.
is_time_boxed     : always true; expiry_date required.
authority         : must be ARB or higher (VOCAB-AUTHORITY-LEVEL ≥ ARB).
```
A waiver is the S1 form of an exception (Tree E-QE1); the schema enforces the
stricter constraints structurally.

### 8.6 Technical-debt item (`DEBT-*`)

```
debt_description  : markdown  [1] required — the compromise taken.
principal         : estimate  [1] required — cost to fix (VOCAB/units, §19).
interest          : estimate  [1] required — ongoing cost of carrying it.
interest_period   : enum      [1] required — PER_SPRINT | PER_MONTH | PER_QUARTER.
deliberate        : boolean   [1] required — taken knowingly (Tree J-QJ2)?
paydown_plan      : markdown  [0..1] cond-required(if status SCHEDULED|IN_PAYDOWN).
review_date       : timestamp [1] required — next reassessment.
recurring         : boolean   [1] required — has this debt returned before? (→ §J-QJ5).
```
Integrity: a `DEBT` that actually breaches a baseline invariant is *not* debt — it
is S1 and must be an ACR/waiver (Tree J-QJ1); the schema flags `severity=S1` on a
`DEBT` as requiring review.

### 8.7 Drift finding (`DRIFT-*`)

```
baseline_ref      : id-ref    [1] required — the baseline element diverged from.
observed_state    : markdown  [1] required — what reality shows.
expected_state    : markdown  [1] required — what the baseline says.
detection_method  : enum      [1] required — AUTOMATED | MANUAL | INCIDENT | AUDIT.
detected_at       : timestamp [1] required — when detected.
disposition       : enum      [0..1] cond-required(if status ≥ CLASSIFIED) —
                                          VOCAB-DISPOSITION (§6).
disposition_link  : id-ref    [0..1] cond-required(if disposition ≠ FALSE_POSITIVE)
                                          — the WVR/ACR/directive resolving it (§7.2).
authorized_at_time: boolean   [1] required — was there prior cover? (Tree B-QB4).
```
Integrity: a non-`FALSE_POSITIVE` drift reaching `CLOSED` **must** have a
`disposition_link` — the schema makes silent acceptance impossible (§11, §7.2).

### 8.8 Cross-domain dependency entry (`XDEP-*`)

```
from_domain       : enum      [1] required — the depending domain (VOCAB-SCOPE).
to_domain         : enum      [1] required — the depended-upon domain.
contract_ref      : markdown  [1] cond-required(if status CONTRACTED|ACTIVE) —
                                          interface, SLA, versioning, dual ownership.
blast_radius      : enum      [1] required — CONTAINED | HIGH | SYSTEMIC.
is_cyclic         : boolean   [1] required — creates a dependency cycle? (Tree I-QI4).
both_owners       : list<actor-ref> [2] required — owner on each side.
```
Integrity: `is_cyclic = true` requires status `BLOCKED` or a covering `WVR/EXC`
(Tree I-QI4).

### 8.9 Release architecture approval record (`REL-*`)

```
release_ref       : string    [1] required — the release identifier (external).
evidence_pack     : list<id-ref> [1..*] required — links to drift, exception,
                                          dependency, checklist artifacts.
open_s1_count     : integer   [1] required — MUST be 0 for GO/CONDITIONAL_GO.
open_s2_accepted  : boolean   [1] required — all open S2 have accepted risk?
conditions        : list<condition> [0..*] cond-required(if CONDITIONAL_GO) — each
                                          with owner + expiry + verification.
decision          : enum      [1] required — status (GO|CONDITIONAL_GO|NO_GO|…).
```
Integrity: `open_s1_count > 0` ⇒ status must be `NO_GO` (Tree G-QG1). Enforced.

### 8.10 Sprint architecture approval record (`SPR-*`)

```
sprint_ref        : string    [1] required — the sprint identifier.
baseline_affecting: boolean   [1] required — did the sprint touch the baseline?
items_routed      : list<id-ref> [0..*] cond-required(if baseline_affecting) —
                                          the ACR/EXC/ADR raised for each (Tree H-QH2).
open_s1_count     : integer   [1] required — > 0 ⇒ ESCALATED/FAIL.
conditions        : list<condition> [0..*] cond-required(if CONDITIONAL_PASS).
decision          : enum      [1] required — status.
```

### 8.11 Audit finding (`AUD-*.NN`)

```
parent_audit      : id-ref    [1] required — FINDING_OF the audit (§7.2).
criterion         : markdown  [1] required — what should be (the control) (references/17 §11.1).
condition         : markdown  [1] required — what is (observed + evidence).
cause             : markdown  [1] required — root cause + category.
consequence       : markdown  [1] required — the risk/"so what".
corrective_action : markdown  [1] required — recommended remediation.
management_response: enum     [0..1] cond-required(if status ≥ RESPONSE_AGREED) —
                                          AGREE | DISAGREE.
action_owner      : actor-ref [0..1] cond-required(if AGREE) — remediation owner.
target_date       : timestamp [0..1] cond-required(if AGREE) — remediation due.
verified_at       : timestamp [0..1] cond-required(if CLOSED) — independent
                                          follow-up verification (references/17 §12.5).
```
Integrity: status `CLOSED` requires `verified_at` — closure-on-assertion is
structurally prevented (§11).

### 8.12 Maturity assessment (`MAT-*`)

```
unit_assessed     : enum      [1] required — VOCAB-SCOPE.
risk_tier         : enum      [1] required — TIER_1 | TIER_2 | TIER_3 | TIER_4.
capability_scores : list<cap_score> [12] required — one per C1..C12; each with
                                          score(0..5), confidence, target, gap.
gated_overall     : integer   [1] required — computed per references/16 §7.3.
gating_capability : enum      [1] required — which S1-critical cap set the floor.
rubric_version    : string    [1] required — the rubric version scored against.
shelf_life_expiry : timestamp [1] required — when the score goes STALE.
```
Integrity: `gated_overall` must equal `min(floor(mean), min S1-critical)` — a
recomputation check audit can re-perform (`references/17` §15, metrics control).

---

## 9. State-model metadata (encoding lifecycle in data)

### 9.1 The status field and its history

`status` (envelope, §5) holds the *current* state. But the schema also requires a
**transition history** so *how* the artifact reached its state is queryable:

```
transitions : list<transition> [1..*] required
transition:
  from_status     : enum       [0..1] — null for the initial creation transition.
  to_status       : enum       [1] required.
  transitioned_at : timestamp  [1] required.
  transitioned_by : actor-ref  [1] required.
  authority       : actor-ref  [1] required — who authorized this transition.
  reason          : markdown   [1] required — why (esp. for reject/revoke/waive).
```

### 9.2 Transition legality

Each artifact type has a **legal transition set** (its state machine, defined in
the owning reference `00`–`12`). The schema validates that every recorded
transition is legal for the type (§11). Illegal transitions (e.g., an ADR jumping
`PROPOSED → SUPERSEDED` without passing `ACCEPTED`) are rejected.

### 9.3 Terminal states

Terminal states (`RETIRED`, `CLOSED`, `REJECTED`, `EXPIRED` where non-renewable)
admit no further transitions except explicit `REOPENED` where the type allows it
(audit findings). An artifact in a terminal state is immutable except for the
addition of `RELATES_TO` links.

---

## 10. Provenance, authorship, and the immutable trail

### 10.1 The provenance object

Every artifact carries a `provenance` object (envelope, §5):

```
provenance:
  origin           : enum      [1] required — HUMAN | SYSTEM | IMPORTED.
  created_by       : actor-ref [1] required — mirrors envelope.
  authored_via     : string    [0..1] optional — the tool/skill/workflow used.
  source_refs      : list<id-ref> [0..*] optional — upstream artifacts it derives from.
  trail_id         : id        [1] required — pointer into the immutable audit trail
                                             (references/17 §16).
```

### 10.2 Actor references, not names

Actors are stored as stable `actor-ref` handles (§3.6). This lets authority checks
(`requester ≠ authority`, `authority ≥ ARB`) and audit re-performance work even
after reorganizations and name changes. Display names are resolved at read time
from an actor registry (governed by `references/04`/`13`), never stored as the key.

### 10.3 The append-only rule

Consistent with `references/17` §16:
- Core decided fields (the `decision` of an accepted ADR, the terms of a granted
  waiver) are **immutable after their deciding transition**. Corrections happen by
  *supersession/amendment* (a new artifact), never silent edit.
- Mutable fields (title, tags, non-decisional summary) may change, but every change
  updates `updated_at` and is captured in the trail.
- The `transitions` and `provenance` are **append-only**; nothing is ever removed.

---

## 11. Integrity constraints and validation rules

An artifact is **valid** only if all of these hold. Validation is what
`references/03` (register governance) and `references/17` (audit) enforce.

**Envelope constraints**
1. `id` matches the ID grammar (§4) and its `TYPE`/`SCOPE` prefix agrees with
   `artifact_type`/`scope`.
2. All required and applicable conditionally-required fields are present and
   non-empty (no sentinel fillers, §3.3).
3. `scope` exists in the domain registry (`references/04`).
4. `status` is a legal value for the type (§6) and consistent with `transitions`
   (the last `to_status` equals `status`).
5. `severity` present for types that require it; and if the Q5 backstop applies
   (baseline invariant / security-compliance / cross-domain), `severity = S1`
   (decision-tree §4).

**Authority & self-approval constraints**
6. Once decided, `authority` is present and ≥ the minimum for the artifact's
   severity/scope (Tree C table).
7. For EXC/WVR/ACR: `requester ≠ authority` (self-approval guard).
8. For WVR: `authority ≥ ARB` and `severity = S1_CRITICAL`.

**Lifecycle & time constraints**
9. Every recorded `transition` is legal for the type (§9.2).
10. `expiry_date`, where required, is a valid absolute future date at grant time; an
    `ACTIVE` artifact past its `expiry_date` is invalid (must be `EXPIRED`).
11. `CLOSED` audit findings require `verified_at` (§8.11); `GO`/`CONDITIONAL_GO`
    releases require `open_s1_count = 0` (§8.9).

**Relationship constraints (referential integrity, §12)**
12. Every `link.target_id` resolves to an existing artifact.
13. Paired links have their inverse on the target (§7.1).
14. A non-`FALSE_POSITIVE` `DRIFT` that is `CLOSED` has a `disposition_link` (no
    silent acceptance, §7.2).
15. An `ACTIVE` `EXC`/`WVR` `COVERS` at least one artifact.
16. Every `ACCEPTED` `ADR` has exactly one mirroring `DRE`; every `DRE`
    `DERIVES_FROM` exactly one `ADR`.

**Provenance constraints**
17. `provenance`, `created_by`, and `trail_id` are present; the trail entry exists.
18. Immutable fields have not changed since their deciding transition (§10.3).

> Any violation is, for audit purposes, at least an S2 integrity finding; a
> violation of the self-approval, silent-drift, or S1-gate constraints (7, 8, 11,
> 14) is **S1** — the schema's structural guards *are* the governance guards.

---

## 12. Traceability graph and referential integrity

### 12.1 The governance knowledge graph

Taken together, the artifacts and their typed links form a directed graph:

- **Nodes** = artifacts (by `id`).
- **Edges** = typed `links` (§7).

This graph is what makes the audit questions of §1 answerable by traversal. Key
guaranteed paths (by the required chains, §7.2):

```
running component
   └─(described by)→ baseline element
        ├─(AUTHORIZED_BY)→ ADR ←(DERIVES_FROM)─ DRE   (why it is this way)
        ├─(last changed by)→ ACR →(resulting_adr)→ ADR (how it changed)
        ├─(diverged as)→ DRIFT →(disposition)→ WVR|ACR|directive (drift story)
        └─(deviation)→ EXC|WVR →(COVERS)→ the element   (what is waived)
```

### 12.2 Referential integrity rules

- **No dangling references.** Every `id-ref`/`link.target_id` must resolve
  (constraint §11.12). A reference to a non-existent artifact is invalid.
- **No orphaned inverses.** Paired links must be symmetric (§11.13).
- **No cycles where forbidden.** `SUPERSEDES` chains are acyclic (an ADR cannot
  transitively supersede itself); `XDEP` cycles require explicit `BLOCKED`/waiver
  (§8.8).
- **Deletion is forbidden.** Because deletion would break referential integrity and
  the immutable trail, artifacts are never deleted — only transitioned to terminal
  states (§9.3, §4-rule-1).

---

## 13. Versioning and schema evolution

### 13.1 Schema is versioned

`schema_version` (envelope) records which schema version an artifact conforms to.
The schema itself carries a semantic version; artifacts remain valid against the
version they were recorded under (mirrors `references/17` §7.3 — historical records
stay judgeable).

### 13.2 Backward compatibility

- **Additive changes** (new optional field, new enum value that doesn't invalidate
  old data) are minor-version, backward-compatible.
- **Breaking changes** (removing/renaming a field, making an optional field
  required, removing an enum value) are major-version and require a migration
  strategy for reading old artifacts. Breaking changes are rare and ARB-approved.

### 13.3 Local extension without fragmentation

Domains may add fields *only* under a namespaced `ext` object
(`ext.<domain>.<field>`), never by redefining core fields (design principle §2.1).
Core queries ignore `ext`; local tooling may use it. This prevents the "every
domain has its own schema" fragmentation that collapses cross-domain queries and
maturity standardization.

### 13.4 Governed like any artifact

Changing this schema changes the shape of the entire governance record, so edits
follow governance change discipline: proposed, reviewed, ARB-approved, versioned —
and recorded as an ADR about the governance system itself (`references/02`), just
as the maturity rubric (`references/16` §11.2), audit criteria (`references/17`
§7.3), and decision trees (`references/18` §22) are.

---

## 14. Retention, classification, and privacy

- **Classification** (`classification`, envelope) drives who may read an artifact
  and how long it is retained. Governance records frequently contain sensitive
  architectural and security detail; default to the most restrictive appropriate
  level, and never place sensitive values in an `id`, `title`, or `tags` (which are
  broadly visible and often indexed) — consistent with the privacy rules on not
  putting sensitive data in identifiers.
- **Retention** is set by risk tier and regulatory obligation (`references/17`
  §16.1); records are retained for their full period and recoverable throughout.
  Terminal-state artifacts are retained, not purged (§12.2).
- **Minimization.** Store the governance facts needed for decisions and audit;
  do not accumulate personal data. Actor references are role/identity handles
  (§10.2), not personal dossiers.
- **Access is need-to-know**, aligned to classification; audit access is broad but
  read-only (`references/17` §2.3).

---

## 15. Query patterns the schema must support

The schema is validated against the *questions it must answer*. It is adequate
only if each of these is a straightforward filter/traversal:

| Question | Fields/links used |
| --- | --- |
| All open S1 items, any type, in a domain | `severity`, `status`, `scope` |
| Everything expiring in 30 days | `expiry_date`, `status=ACTIVE` (EXC/WVR) |
| Drift with no disposition (silent-accept detector) | `DRIFT.status`, `disposition_link` |
| Exceptions renewed > N times (permanent-temporary) | `EXC.renewal_count` |
| ADR coverage (decisions without ADRs) | `DRE`↔`ADR` chain gaps |
| Releases that went GO with open S1 (impossible if valid) | `REL.open_s1_count`, `decision` |
| Self-approved decisions (violation detector) | `requester`, `authority` equality |
| Full lineage of a component | traverse the graph (§12.1) |
| Debt interest by domain this quarter | `DEBT.interest`, `interest_period`, `scope` |
| Audit findings closed without verification | `AUD.status=CLOSED`, `verified_at` null |
| Maturity floor per unit | `MAT.gated_overall`, `gating_capability` |

If a needed governance question is *not* answerable from the schema, that is a
schema gap and an input to schema evolution (§13) — not a reason to store the
answer ad hoc in free text.

---

## 16. Anti-patterns in governance metadata

- **16.1 Free-text where an enum belongs.** Recording severity/status/scope as prose
  ("pretty critical", "sort of done") — destroys queryability and every KPI.
  Defeated by controlled vocabularies (§6) and validation (§11).
- **16.2 Prose links.** "See the related ADR" instead of a typed `link`. Breaks the
  traceability graph; audit cannot traverse it (§7, §12).
- **16.3 Sentinel fillers.** "TBD"/"N/A" in required fields to force a record
  through. The artifact is simply not valid yet (§3.3).
- **16.4 Silent edits of decided fields.** Changing an accepted ADR's decision or a
  granted waiver's terms in place. Forbidden — supersede/amend instead (§10.3).
- **16.5 Relative dates.** "Expires next quarter." Unqueryable and ambiguous; store
  absolute (§3.4).
- **16.6 Schema fragmentation.** Each domain inventing its own fields for the same
  artifact. Defeated by namespaced `ext` and org-wide core (§13.3).
- **16.7 Names as keys.** Storing a person's display name as the owner/authority.
  Breaks on reorganization; use `actor-ref` (§10.2).
- **16.8 Deleting artifacts.** Purging rejected/retired records. Breaks referential
  integrity and the audit trail; transition to terminal instead (§12.2).
- **16.9 The disconnected record.** A drift with no disposition link, a waiver
  covering nothing, an ADR with no register entry. Each is an integrity violation
  and, not coincidentally, exactly a governance failure the schema is built to make
  impossible (§11, §7.2).

---

## 17. Worked example — a linked record set

> *Illustrative. A drift is found, waived short-term, then promoted to a change —
> the full governed story, expressed as linked artifacts.*

1. **`DRIFT-PAY-0130`** — status `CONFIRMED`, `severity S1_CRITICAL` (touches a
   baseline element), `authorized_at_time = false`. `observed_state`: cache layer
   replaced; `expected_state`: original cache per baseline. `detection_method
   AUTOMATED`.

2. Disposition chosen = short-term `WAIVE` then `PROMOTE_TO_CHANGE`. First:
   **`WVR-ORG-0003`** — `severity S1_CRITICAL`, `is_time_boxed true`, `expiry_date
   2026-10-15T00:00:00Z`, `authority ARB` (≥ ARB ✓), `requester ≠ authority` ✓,
   `conditions`: ["monitor error rate", "raise ACR by expiry"], `remediation_plan`:
   promote to baseline via ACR. Link: `WVR-ORG-0003 COVERS DRIFT-PAY-0130`; inverse
   `DRIFT-PAY-0130 COVERED_BY WVR-ORG-0003`.

3. **`ACR-PAY-0058`** — `change_description`: adopt the new cache layer as baseline;
   `baseline_diff`: explicit; `baseline_refs`: [the cache element]; `blast_radius
   CONTAINED`; `is_emergency false`; `rollback_plan`: present; `authority ARB`.
   Status → `APPROVED`. Link: `ACR-PAY-0058 PROMOTES DRIFT-PAY-0130`.

4. **`ADR-PAY-0042`** — records the decision; `decision`: "adopt cache layer X";
   `options_considered` ≥ 2; `consequences`: stated. Status `ACCEPTED`, `authority
   ARB`. Links: `ADR-PAY-0042 DERIVES_FROM ACR-PAY-0058`.

5. **`DRE-PAY-0042`** — register mirror; `decision_id → ADR-PAY-0042`
   (`DERIVES_FROM`); `affects_baseline true`; `baseline_refs`: [cache element];
   `decided_by ARB`, `decided_on` set.

6. On promotion, **`DRIFT-PAY-0130`** → `CLOSED` with `disposition
   PROMOTE_TO_CHANGE`, `disposition_link ACR-PAY-0058`. The waiver
   `WVR-ORG-0003` → `REMEDIATED` (the deviation became the baseline; nothing left
   to waive).

**Integrity check (the schema doing its job):**
- Drift `CLOSED` *has* a `disposition_link` → no silent acceptance (§11.14). ✓
- Waiver was `S1` + time-boxed + ARB + `requester ≠ authority` (§11.7–8). ✓
- Accepted ADR has exactly one DRE (§11.16). ✓
- All links have inverses (§11.13). ✓
- The whole story is traceable: from the running cache layer, one graph walk
  reaches the drift, the waiver that held it, the ACR that promoted it, and the ADR
  that recorded why (§12.1) — exactly what audit (`references/17`) traces and what
  the maturity model (`references/16`) credits as standardized, evidenced
  governance.

---

## 18. Integration with the operating model

- **Who owns the schema.** The governance function owns it; the ARB governs changes
  (§13.4). The schema is itself an architected asset with its own ADR.
- **How it binds the skill.** Every `templates/*` is a fill-in instance of a schema
  here; every workflow reads/writes these fields; `references/03` enforces the
  integrity rules (§11) operationally; `references/17` audits conformance to them;
  `references/18` routes on their values; `references/14` computes KPIs from them;
  `references/16` credits maturity when they are consistent org-wide.
- **Read-only discipline.** This file *defines and validates* shape; it does not
  create artifacts (only explicit-request recording does), and it never emits code,
  DDL, or migrations — a store *implementing* this schema is a delivery-line
  concern, out of scope (`SKILL.md` §2, §8). Where a governance need implies
  tooling, the schema states the data contract and hands implementation to the
  delivery line.

---

## 19. Appendix A — field-type reference

| Type | Definition | Example |
| --- | --- | --- |
| `id` | An identifier per the ID grammar (§4); immutable. | `ADR-PAY-0042` |
| `id-ref` | A reference to another artifact's `id`; must resolve (§12). | `ACR-PAY-0058` |
| `enum` | A value from a named controlled vocabulary (§6). | `S1_CRITICAL` |
| `string` | Short single-line text, length-bounded, no markup. | `"Adopt cache X"` |
| `markdown` | Long-form human text; structured, non-executable. | rationale blocks |
| `timestamp` | Absolute ISO-8601, TZ-qualified (§3.4). | `2026-07-16T14:03:00Z` |
| `actor-ref` | Stable role/identity handle (§10.2), not a display name. | `role:pay-arch-owner` |
| `boolean` | true/false; named as a positive assertion (§3.2). | `is_time_boxed` |
| `integer` | Whole number (counts). | `renewal_count = 2` |
| `decimal` | Fixed-precision number (rare; estimates). | `interest = 3.5` |
| `estimate` | A structured estimate: value + unit + confidence. | `{8, STORY_POINTS, MED}` |
| `list<T>` | Ordered collection of type T. | `list<id-ref>` |
| `link` | `{type, target_id, note}` typed relationship (§7). | see §7 |
| `transition` | A state-change record (§9.1). | see §9.1 |
| `provenance` | The authorship/trail object (§10.1). | see §10.1 |
| `condition` | `{text, owner, expiry, verification}` (approvals). | release conditions |
| `option` | `{name, pros, cons}` (ADR options). | ADR options |
| `cap_score` | `{capability, score, confidence, target, gap}` (maturity). | see §8.12 |

---

## 20. Appendix B — controlled-vocabulary master list

| Vocabulary | Values |
| --- | --- |
| SEVERITY | `S1_CRITICAL, S2_MAJOR, S3_MINOR, S4_INFORMATIONAL` |
| CLASSIFICATION | `PUBLIC_INTERNAL, CONFIDENTIAL, RESTRICTED, SECRET` |
| AUTHORITY-LEVEL | `DOMAIN_OWNER, ARB, CHIEF_ARCHITECT, CTO, EMERGENCY_DELEGATE` |
| ARTIFACT-TYPE | `ADR, DRE, ACR, EXC, WVR, DEBT, DRIFT, XDEP, REL, SPR, AUD, MAT` |
| DISPOSITION | `REMEDIATE, WAIVE, PROMOTE_TO_CHANGE, FALSE_POSITIVE` |
| BLAST-RADIUS | `CONTAINED, CROSS_DOMAIN, HIGH, SYSTEMIC` |
| DETECTION-METHOD | `AUTOMATED, MANUAL, INCIDENT, AUDIT` |
| RISK-TIER | `TIER_1, TIER_2, TIER_3, TIER_4` |
| INTEREST-PERIOD | `PER_SPRINT, PER_MONTH, PER_QUARTER` |
| ORIGIN | `HUMAN, SYSTEM, IMPORTED` |
| LINK-TYPE | `SUPERSEDES, SUPERSEDED_BY, AMENDS, REFINES, DERIVES_FROM, COVERS, COVERED_BY, AUTHORIZES, AUTHORIZED_BY, BREACHES, REMEDIATES, PROMOTES, DEPENDS_ON, BLOCKS, RELATES_TO, EVIDENCED_BY, FINDING_OF` |
| (STATUS per type) | see §6 per-type table |

---

## 21. Appendix C — JSON/YAML shape examples (illustrative, non-normative)

> These illustrate *shape only*. They are not a storage prescription; the schema is
> store-agnostic (§2.8). Implementing a store is out of scope.

**An exception (`EXC-*`) as YAML:**

```yaml
id: EXC-IDN-0007
artifact_type: EXC
title: "Temporary deviation from token-rotation baseline"
summary: "Identity defers automated token rotation for one quarter pending X."
scope: IDN
severity: S2_MAJOR
status: ACTIVE
owner: role:idn-arch-owner
authority: role:arb-chair
created_at: 2026-07-16T09:00:00Z
created_by: role:idn-lead
updated_at: 2026-07-16T09:00:00Z
schema_version: "1.0.0"
classification: CONFIDENTIAL
requester: role:idn-lead            # differs from authority (guard §11.7)
is_time_boxed: true
expiry_date: 2026-10-16T00:00:00Z
conditions: ["manual rotation weekly", "raise ACR before expiry"]
remediation_plan: "Automate rotation in Q4; see roadmap."
renewal_count: 0
covers: [DRIFT-IDN-0021]
links:
  - {type: COVERS, target_id: DRIFT-IDN-0021}
transitions:
  - {from_status: null, to_status: REQUESTED, transitioned_at: 2026-07-16T09:00:00Z,
     transitioned_by: role:idn-lead, authority: role:idn-lead, reason: "raise"}
  - {from_status: REQUESTED, to_status: GRANTED, transitioned_at: 2026-07-16T11:00:00Z,
     transitioned_by: role:arb-chair, authority: role:arb-chair, reason: "approved, time-boxed"}
  - {from_status: GRANTED, to_status: ACTIVE, transitioned_at: 2026-07-16T11:01:00Z,
     transitioned_by: role:arb-chair, authority: role:arb-chair, reason: "in effect"}
provenance:
  origin: HUMAN
  created_by: role:idn-lead
  authored_via: "workflows/exception-and-waiver-request.md"
  trail_id: TRAIL-IDN-3391
```

**A drift finding (`DRIFT-*`) as JSON (abbreviated):**

```json
{
  "id": "DRIFT-IDN-0021",
  "artifact_type": "DRIFT",
  "scope": "IDN",
  "severity": "S2_MAJOR",
  "status": "CLASSIFIED",
  "owner": "role:idn-arch-owner",
  "baseline_ref": "BASE-IDN-TOKEN-ROTATION",
  "observed_state": "Rotation is manual weekly.",
  "expected_state": "Rotation is automated per baseline.",
  "detection_method": "AUDIT",
  "detected_at": "2026-07-15T00:00:00Z",
  "disposition": "WAIVE",
  "disposition_link": "EXC-IDN-0007",
  "authorized_at_time": false,
  "links": [{"type": "COVERED_BY", "target_id": "EXC-IDN-0007"}],
  "schema_version": "1.0.0",
  "classification": "CONFIDENTIAL"
}
```

Note the two artifacts are mutually linked (`COVERS`/`COVERED_BY`), the drift has a
`disposition_link` (no silent acceptance), and the exception's `requester ≠
authority` — the schema's structural guards are visible in the data itself.

---

## 22. Appendix D — glossary deltas

Terms introduced by this reference (add to
`references/15-glossary-and-taxonomy.md`):

- **Governance metadata schema** — the canonical, store-agnostic data model for all
  governance artifacts (this file).
- **Common envelope** — the fields every artifact shares, enabling cross-type
  queries (§5).
- **ID grammar** — the `TYPE-SCOPE-SEQ[.SUBSEQ]` identifier scheme; IDs are
  immutable and never reused (§4).
- **Controlled vocabulary** — a fixed enumeration for a decision-driving field
  (§6).
- **Typed link** — a first-class, referential relationship between artifacts, with
  a required inverse for paired types (§7).
- **Governance knowledge graph** — the directed graph of artifacts and typed links
  that makes lineage and audit questions answerable by traversal (§12).
- **Transition history** — the append-only record of every state change with actor,
  authority, and reason (§9).
- **Actor-ref** — a stable role/identity handle used instead of a display name
  (§10.2).
- **Structural guard** — an integrity constraint (§11) that makes a governance
  failure (self-approval, silent drift acceptance, S1 gate bypass) impossible to
  record as valid data.
- **Namespaced extension (`ext`)** — the only sanctioned way to add local fields
  without fragmenting the org-wide schema (§13.3).
- **Conditionally-required field** — a field required only when a stated condition
  holds; the condition is part of the schema (§3.3).

---

*Governance Metadata Schema — the connective tissue. It gives every governance
artifact one shape, one identifier scheme, one vocabulary, and typed, referentially-
integral links, turning a pile of documents into an auditable knowledge graph. It
describes and validates data; it never creates it without an explicit request, and
it never produces code, DDL, or migrations.*
