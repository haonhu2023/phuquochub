# Option Comparison Worksheet

Version: 1.0.0
Status: Draft

## Purpose

An optional worksheet for comparing multiple viable options before recording
a decision. It exists to help fill in the **Alternatives Considered** section
of an ADR with structured reasoning instead of a plain paragraph.

This worksheet defines no governance rules. It does not determine whether a
decision requires an ADR, who approves it, or what process it must follow —
all of that is inherited from the existing Production SSOT documents (e.g.
`.claude/skills/ssot/authority-policy.md.txt`, `governance-model.md.txt`,
`change-management.md.txt`) and the ADR process itself.

## How to use this worksheet

1. Use it only when a decision has more than one viable option and the
   comparison isn't obvious.
2. Fill in the sections below.
3. Copy the relevant results into the **Alternatives Considered** (and
   optionally **Consequences**) section of the real ADR, using
   [`docs/99-decisions/ADR-template.md`](../../docs/99-decisions/ADR-template.md).
4. This worksheet itself is not a governance artifact and is not meant to be
   committed as a standalone record — the ADR is the record of truth.

---

## Decision Matrix

| Option | Description | Benefits | Drawbacks | Dependencies | Estimated Effort | Confidence |
|---|---|---|---|---|---|---|
| A | | | | | | |
| B | | | | | | |
| C | | | | | | |

## Evaluation Dimensions

Score each option (e.g. 1–5) against the dimensions relevant to this
decision. Not every dimension applies to every decision — delete rows that
don't matter here.

| Dimension | Option A | Option B | Option C | Notes |
|---|---|---|---|---|
| Functional Fit | | | | |
| Security | | | | |
| Performance | | | | |
| Scalability | | | | |
| Reliability | | | | |
| Maintainability | | | | |
| Operational Complexity | | | | |
| Cost | | | | |
| Delivery Time | | | | |
| User Impact | | | | |

## Weighted Scoring (optional)

Use only if dimensions matter unequally. Weights should sum to 1.0.

| Dimension | Weight | Option A (score × weight) | Option B | Option C |
|---|---|---|---|---|
| | | | | |

**Total weighted score**: A = ___, B = ___, C = ___

## Trade-off Analysis

For the recommended option, state plainly:

- What is gained:
- What is sacrificed:
- Why the alternatives were rejected:
- Known limitations:

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| | | | |

## Assumptions

List anything taken as given that, if wrong, would change the outcome.

- 

## Recommendation

State the preferred option and a one-paragraph justification, suitable for
copying into the ADR's **Decision** and **Alternatives Considered** sections.

---

*Governance, approval, and process requirements for this decision are
inherited entirely from the existing Production SSOT documents — this
worksheet does not define or modify them. See
[`docs/99-decisions/ADR-template.md`](../../docs/99-decisions/ADR-template.md)
for the actual decision record format.*
