# ADR-DELIVERY-001 — Adopt State-Driven Delivery Control and Deprecate Sequential BUILD Reports as Execution Gates

- **Status:** Accepted (bootstrap; provisional pending human ratification)
- **Date:** 2026-07-22
- **Scope:** Delivery execution control only. Does not alter product/domain architecture.

## Context

Engineering on PhuQuocHub was driven by a sequential chain of prompts —
`BUILD_001 … BUILD_014` — where each step declared the previous ones as mandatory
inputs. In reality only `BUILD_002` had ever been authored. Every prompt from `BUILD_003`
upward therefore returned `BLOCKED`, and later prompts assumed implementation,
deployment, canary, hypercare, and stabilization states that never occurred. Meanwhile
the actual Place code exists and is substantially implemented (`apps/api/src/modules/places/`).

`BUILD_001` has since been authored
(`delivery/sprint-01-core-data/BUILD_001_PLACE_INSPECTION_GAP_ANALYSIS.md`) from real
inspection, confirming the module is real and the chain's blockage was purely a numbering
artifact.

## Problem

The report **numbering** was being used as an **execution gate**. This coupled the
ability to do engineering to the existence of documents, not to the state of the code.
The result was a loop that produced no engineering while the codebase sat ready.

## Decision

Adopt a **state-driven** delivery model:

- [`docs/delivery/state.yaml`](../state.yaml) is the single **execution-control** source.
- Work is organized into **workstreams** (first: `place`) and **tasks** (first:
  `PLACE-001`) that are executable from the repository's real state.
- The sequential `BUILD_00x` chain is **deprecated as an execution-control mechanism**.
  Existing reports are retained as historical evidence; no missing report will be
  synthetically reconstructed to satisfy numbering.

## Alternatives considered

1. **Continue the BUILD chain, backfilling missing reports.** Rejected: it would require
   fabricating prior-state findings (implementation/deployment/stabilization) that never
   happened — a direct violation of repository-truth principles.
2. **Ad-hoc engineering with no state model.** Rejected: loses traceability and the
   guardrails (evidence, gates, prohibited actions) that governance expects.
3. **State-driven framework (chosen).** Keeps guardrails, removes the false dependency on
   report numbering, and starts from evidence.

## Consequences

- **Positive:** engineering can start immediately at `PLACE-001`; every claim is
  evidence-bound; deployment/release states cannot be asserted without proof.
- **Negative / cost:** a new (small) set of state files to maintain; contributors must
  learn to update `state.yaml` and `history/` on task transitions.
- Legacy `BUILD_002` (and the new `BUILD_001`) remain valid **evidence**, not gates.

## Migration approach

1. Bootstrap `docs/delivery/` (this change) — non-destructive, documentation only.
2. Register `place` as the first workstream; define `PLACE-001`.
3. Future tasks are created as `PLACE-002`, etc., or per-workstream ids for other modules.
4. No source code, migration, DTO, or contract is modified during bootstrap.

## Compatibility with existing governance

This ADR does **not** erase or override:

- SSOT documents (`docs/data/modules/places.md`, `docs/api/*`);
- the ADR set under `docs/99-decisions/` (ADR-001..ADR-016);
- Architecture Review, Documentation Freeze, or
  `enterprise-engineering-framework/00-governance/`.

Those remain the authority on **what is correct**. `state.yaml` only governs **what
proceeds next**, and must always select work consistent with them. Where governance and
code conflict (e.g. openapi vs implementation for list params — BUILD_001 GAP-05/10), the
task records the conflict and defers to the governance authority order rather than
silently choosing a side.

## Rollback approach

The framework is additive and documentation-only. To roll back, delete `docs/delivery/`
(or mark `delivery.initialized: false` in `state.yaml`) and resume prior conventions. No
code or data is affected.

## Approval assumptions

Marked **provisional**: authored during bootstrap without a recorded human approver. A
project owner should ratify (or amend) this ADR. Until then it governs execution by
default because the prior mechanism was non-functional.

## Evidence references

- `delivery/sprint-01-core-data/BUILD_002_PLACE_PRIORITY_REMEDIATION.md` (only pre-existing report)
- `delivery/sprint-01-core-data/BUILD_001_PLACE_INSPECTION_GAP_ANALYSIS.md` (authored 2026-07-22)
- `apps/api/src/modules/places/**` (real implementation)
- `docs/delivery/reports/bootstrap-baseline.md`
