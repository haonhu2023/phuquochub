# PhuQuocHub Delivery Framework (state-driven)

This directory is the **active execution-control source** for engineering work on
PhuQuocHub. It replaces the deprecated sequential `BUILD_001 … BUILD_014` report chain
(see [`decisions/ADR-DELIVERY-001.md`](decisions/ADR-DELIVERY-001.md)).

## Purpose

Let engineering start and continue from the **repository's real state** instead of a
brittle numbered report chain where each step assumed the previous one had completed.
The framework records what is actually true (evidence-backed) and what the next
executable task is — nothing more.

## Governance vs execution control

- **Governance inputs (unchanged, still authoritative):** the SSOT documents under
  `docs/` (e.g. `docs/data/modules/places.md`), the ADRs under `docs/99-decisions/`,
  Architecture Review, Documentation Freeze, and
  `enterprise-engineering-framework/00-governance/`. These decide *what is correct*.
- **Execution control (this framework):** [`state.yaml`](state.yaml) decides *what may
  proceed next*. It never overrides governance; it points at the next task that is
  consistent with governance and with the current repository state.

## Authoritative state files

| File | Role |
|---|---|
| [`state.yaml`](state.yaml) | Current phase, workstream, task, gates, verification environment, next action |
| [`project-registry.yaml`](project-registry.yaml) | Detected apps, packages, stack, modules, CI |
| [`workstreams/place.yaml`](workstreams/place.yaml) | The Place workstream, its evidence and gaps |
| [`tasks/PLACE-001.yaml`](tasks/PLACE-001.yaml) | The first executable task |
| [`reports/bootstrap-baseline.md`](reports/bootstrap-baseline.md) | Repository baseline captured at bootstrap |
| [`evidence/README.md`](evidence/README.md) | Evidence policy + where evidence records live |
| [`history/README.md`](history/README.md) | Append-only log of state transitions |

## Task status lifecycle

```
draft → ready → in_progress → validation → completed
```

Additional terminal/paused states: `blocked`, `cancelled`, `superseded`, `rolled_back`.

A task moves to **`completed`** only when **both** its `acceptance_criteria` and its
`evidence_requirements` are satisfied. Completion updates `state.yaml` (and appends to
`history/`) with the next task.

## How Claude Code (or a human) determines the next action

1. Read [`state.yaml`](state.yaml) → `current.task` and `next_action`.
2. Open the referenced task file under `tasks/`.
3. Execute only within that task's `repository_scope` and `prohibited_actions`.
4. Produce evidence per the task's `evidence_requirements`.
5. On success, apply the task's `completion_transition`; on a real blocker, apply
   `failure_transition` and record the concrete cause.

## How evidence is recorded

See [`evidence/README.md`](evidence/README.md). In short: every non-trivial claim cites
a repository `path:line`, or a captured command output, or an approval reference. A claim
with no evidence must be written as `unknown` / `not_verified` / `not_started` / `blocked`.

## Rules against fabricated completion

The following strings must **never** appear without attached evidence:

```
deployed successfully · production stabilized · backfill completed
all consumers migrated · legacy path unused · hypercare passed · tests passed
```

If it wasn't run or observed, it is `not_verified`. In this environment specifically,
lint/typecheck/build/tests are **not runnable** (no Node runtime; FAT32 unlinks
workspace packages) — such checks are reported `NOT EXECUTED` with cause.

## How blocked states are handled

`blocked` requires a concrete, recorded cause (missing dependency, permission, absent
evidence, unresolved authority conflict). A missing legacy BUILD report is **not** a
valid blocker. Partial implementation and failing/unrunnable tests are **not** blockers
for *documenting* state — they are recorded as facts.

## Human override

A human may edit `state.yaml` directly (change `current.task`, reopen a gate, cancel a
workstream). Record the reason in [`history/README.md`](history/README.md). Human edits
win over inferred state.

## Legacy BUILD reports

Retained as historical artifacts under `delivery/sprint-01-core-data/` (`BUILD_001`,
`BUILD_002`). They are reference evidence only and no longer gate execution. Do not
create new `BUILD_00x` reports to satisfy numbering.

## Minimal workflow to start the next task

```
Execute PLACE-001 — Place Domain and Persistence Baseline Analysis
using docs/delivery/state.yaml and docs/delivery/tasks/PLACE-001.yaml as execution authority.
```
