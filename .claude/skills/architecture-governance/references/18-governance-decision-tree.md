# Architecture Governance — Governance Decision Trees

> **Scope.** This reference is the **routing brain** of the Architecture
> Governance skill. It converts an incoming request or observed situation into
> the correct governance path: *which function applies, which authority decides,
> which process runs, and what the possible outcomes are.* Where `SKILL.md` §4 is
> a static routing *table*, this file is the set of executable *decision trees*
> that resolve the ambiguous, overlapping, and multi-function cases the table
> cannot.
>
> **Read-only contract.** A decision tree *classifies and routes*; it renders a
> recommended path and the authority that must ratify it. Traversing a tree is an
> **advisory act** — it produces a routing decision, not a governance action. Any
> resulting artifact (an ADR, an ACR, a waiver) is recorded only on explicit
> request, by the process the tree routes to. No tree here ever produces code. See
> `SKILL.md` §2.
>
> **Relationship to the rest of the skill.** Every leaf of every tree lands on a
> specific reference (`references/00`–`17`), workflow (`workflows/*`), authority
> (`references/00`, `references/13`), and severity (`references/15`). The trees do
> not re-define those; they *select* among them deterministically.

---

## Table of contents

1. Purpose — why decision trees, not just a table
2. How to read and traverse a tree (notation and rules)
3. The determinism principle
4. The master triage tree (entry point for every request)
5. Tree A — Is this even Architecture Governance's job?
6. Tree B — Change vs. exception vs. drift vs. debt (the great confusion)
7. Tree C — Which authority decides? (the authority-resolution tree)
8. Tree D — ADR: needed, new, supersede, or none?
9. Tree E — Exception vs. waiver, and who may grant it
10. Tree F — Drift finding disposition (remediate / waive / promote)
11. Tree G — Release approval: go / conditional / no-go
12. Tree H — Sprint approval: pass / conditional / escalate
13. Tree I — Cross-domain dependency: allowed / contract / block
14. Tree J — Technical debt: accept / reject / must-fix-now
15. Tree K — Escalation: decide locally or escalate?
16. Tree L — Severity classification (S1–S4)
17. Tie-breaking and precedence rules across trees
18. Multi-function requests — decomposition procedure
19. When no tree fits — the safe-default path
20. Worked traversals (four end-to-end examples)
21. Anti-patterns in routing
22. Integration with the operating model
23. Appendix A — consolidated quick-routing table
24. Appendix B — the one-page master flow
25. Appendix C — glossary deltas

---

## 1. Purpose — why decision trees, not just a table

The routing table in `SKILL.md` §4 answers the easy question: *"I know this is an
ADR task — where do I go?"* It fails on the hard questions that dominate real
governance work:

- *"The team changed a component that diverges from the baseline. Is this a
  **change** (raise an ACR), a **drift** (raise a finding), an **exception**
  (grant a waiver), or **debt** (log a debt item)?"* — the same facts can land in
  four different processes with four different authorities.
- *"Who is actually allowed to say yes to this?"* — the answer depends on scope,
  severity, blast radius, and whether a frozen baseline is touched.
- *"This request contains three governance actions bundled together."* — the table
  routes one thing at a time.

Misrouting is the single most common governance failure: a baseline breach
mislabeled as "debt" and quietly logged; a cross-domain change self-approved as a
"minor exception"; a drift silently blessed instead of promoted to a change. The
decision trees exist to make routing **deterministic, defensible, and
reproducible** — two people with the same facts reach the same path.

> **The trees encode judgment so it is not re-improvised each time.** That is
> exactly the maturity-model definition of governance done well (`references/16`
> §1.3): the same quality of decision independent of who is in the room.

---

## 2. How to read and traverse a tree (notation and rules)

### 2.1 Notation

- **`Q:`** a decision node — a single, binary or small-branch question with an
  objective answer.
- **`→`** a branch to the next node or a leaf.
- **`⇒ LEAF:`** a terminal outcome — the routed function, authority, process, and
  the artifact it may produce.
- **`⚑`** a mandatory stop/escalate flag — traversal cannot proceed past it
  without the named authority.
- **`↩`** a cross-tree jump — hand off to another tree named at the arrow.

### 2.2 Traversal rules

1. **Always enter through the master triage tree (§4).** Never jump straight to a
   sub-tree; the master tree confirms the request is in scope and picks the
   primary sub-tree.
2. **Answer each node from evidence, not assumption.** If a node's answer is
   unknown, that is itself the output: *"cannot route until X is established"* —
   surface the missing fact rather than guessing.
3. **One primary path per request.** If a request spans functions, decompose it
   first (§18), then traverse one path per sub-request.
4. **Never skip a `⚑` flag.** A skipped mandatory stop is a routing violation and
   an anti-pattern (§21.2).
5. **A tree recommends; the named authority ratifies.** Traversal output is
   advisory until the authority in the leaf acts.
6. **Record the traversal.** For any non-trivial routing, the path taken (the
   nodes and answers) is part of the decision's evidence — it shows *why* this
   process and authority, not another.

### 2.3 What a leaf always specifies

Every `⇒ LEAF` states four things, so routing is complete:

- **Function** — the governance function (`references/NN`).
- **Authority** — who must ratify (`references/00` / `13`).
- **Process** — the workflow to run (`workflows/*`), if any.
- **Artifact** — what may be recorded, *on explicit request only*.

---

## 3. The determinism principle

> **Given the same facts, the trees must yield the same route every time.**

This is the property that separates governance routing from ad-hoc judgment. To
preserve it:

- **Nodes ask objective questions.** "Does this change a frozen-baseline
  invariant?" is objective; "Is this a big deal?" is not. Subjective nodes are
  redesigned or backed by a defined threshold (`references/15`, `references/14`).
- **Precedence is fixed** (§17). When two branches seem to apply, the precedence
  rules decide, deterministically, which wins.
- **The safe default is defined** (§19). When no leaf fits, traversal routes *up*,
  not *through* — the ambiguous case escalates rather than being force-fit into a
  convenient process.
- **Traversals are recorded and auditable.** Because governance audit
  (`references/17`) tests routing conformance, the path must be reconstructable.

Determinism does not mean rigidity: the trees are versioned governed artifacts
(like the maturity rubric and audit criteria) and evolve — but a *given version*
routes deterministically.

---

## 4. The master triage tree (entry point for every request)

Every request enters here.

```
START ─ a governance request or observed situation arrives
│
├─ Q1: Does this ask for production code, IaC, migrations, tests, or build config?
│     → YES ⇒ LEAF-OUT-OF-SCOPE(code):
│              Function: none. This skill NEVER produces these (SKILL.md §2, §8).
│              Action: decline to build; if a governance decision implies the
│              change, emit a DIRECTIVE to the delivery line and route the
│              governance part below. Authority: n/a. Artifact: none.
│     → NO  → Q2
│
├─ Q2: Is the subject architecture that has passed DOCUMENTATION FREEZE
│       (i.e., a frozen baseline exists)?
│     → NO  ↩ Tree A (is this even our job? likely Architecture Review / SSOT)
│     → YES → Q3
│
├─ Q3: Is this ADVISORY (assess / opine / classify) or a RECORDING request
│       (write an artifact)?
│     → ADVISORY   → proceed; default posture, no artifact (SKILL.md §5.2)
│     → RECORDING  → proceed; artifact allowed ONLY because explicitly requested
│                    → continue to Q4 either way
│
├─ Q4: What is the PRIMARY governance intent? (pick one; decompose if many — §18)
│     → change to the baseline .......................... ↩ Tree B → Tree D/E/F
│     → record/govern a decision ........................ ↩ Tree D (ADR)
│     → a deviation someone wants permission for ........ ↩ Tree E (exception)
│     → reality diverged from the baseline .............. ↩ Tree F (drift)
│     → a compromise/shortcut to track .................. ↩ Tree J (debt)
│     → approve a release ............................... ↩ Tree G
│     → approve a sprint ................................ ↩ Tree H
│     → a dependency between domains .................... ↩ Tree I
│     → "who decides this?" ............................. ↩ Tree C
│     → "how bad is this?" .............................. ↩ Tree L (severity)
│     → a dispute or a decision above someone's mandate . ↩ Tree K (escalation)
│     → audit / assurance of governance itself .......... ⇒ references/17
│     → "how good is our governance?" ................... ⇒ references/16
│     → none of the above / unclear .................... ↩ §19 safe default
│
└─ Q5 (always, after routing): Does a FROZEN BASELINE INVARIANT, a SECURITY/
      COMPLIANCE control, or a CROSS-DOMAIN CONTRACT get touched?
      → YES ⚑ Minimum severity is S1; self-approval is forbidden; the lowest
              competent authority is at least the ARB. Carry this flag into
              whichever sub-tree you entered.
      → NO  → proceed at the severity the sub-tree assigns.
```

> **The Q5 backstop** runs on *every* path. It is the single most important guard:
> no matter how a request is labeled, if it touches a baseline invariant, a
> security/compliance control, or a cross-domain contract, it is S1 and cannot be
> self-approved. This is what stops a baseline breach from being quietly routed
> into "minor exception" or "debt."

---

## 5. Tree A — Is this even Architecture Governance's job?

Governance begins at Documentation Freeze. Much that *looks* like governance
belongs upstream.

```
A-START
│
├─ QA1: Has the architecture been reviewed AND documentation-frozen?
│     → NO, still being designed/qualified ⇒ LEAF-A1:
│           Function: NOT this skill. Route to ARCHITECTURE REVIEW (pre-freeze
│           qualification). Governance activates only at freeze (SKILL.md §3).
│     → NO, it's a factual question about the system-of-record ⇒ LEAF-A2:
│           Route to SSOT. Governance READS the SSOT; it does not answer for it.
│     → YES → QA2
│
├─ QA2: Is the request to CHANGE the architecture, or to CHANGE THE DOCS that
│        describe a frozen architecture?
│     → change the docs only (typo, clarification, no design change) ⇒ LEAF-A3:
│           Route to DOCUMENTATION FREEZE's controlled-amendment path; a doc-only
│           correction is not an architecture change — but confirm it is truly
│           design-neutral (if in doubt, it is a change ↩ Tree B).
│     → change the architecture ↩ Tree B
│
├─ QA3: Is this a delivery/implementation decision with no architectural
│        significance (naming, local refactor within a component's boundary)?
│     → YES ⇒ LEAF-A4:
│           Function: NOT governance. Below the altitude of an ADR
│           (see Tree D-Q1). No governance artifact. Leave with the delivery team.
│     → NO → return to master Q4
│
└─ QA4: Does this contradict the SSOT?
      → YES ⚑ ⇒ LEAF-A5:
            This is a FINDING, not a decision. Governance does not override the
            SSOT (SKILL.md §8). Surface the contradiction to the SSOT owner and
            the ARB. Do NOT resolve it unilaterally.
      → NO → return to master Q4
```

---

## 6. Tree B — Change vs. exception vs. drift vs. debt (the great confusion)

The most consequential tree. The **same facts** — "the system does not match the
baseline" — route to four different processes depending on *intent, timing, and
permanence*. Getting this wrong is the top governance failure (§1).

```
B-START ─ "the system does/should diverge from the frozen baseline"
│
├─ QB1: Has the divergence ALREADY HAPPENED in the running system?
│     → NO (it's proposed / not yet built)          → QB2
│     → YES (it already exists)                      → QB4
│
├─ QB2: Is the intent to make the divergence the NEW baseline (permanent,
│        the baseline should change)?
│     → YES ⇒ ROUTE: CHANGE. ↩ Tree C for authority, then
│           references/05 + workflows/architecture-change-request.md.
│           Artifact (on request): an ACR, and an ADR for the decision (Tree D).
│     → NO  → QB3
│
├─ QB3: Is the intent a KNOWING, TEMPORARY deviation the baseline should NOT
│        adopt (we accept being non-conformant for now, on purpose)?
│     → YES ⇒ ROUTE: EXCEPTION/WAIVER. ↩ Tree E.
│           references/08 + workflows/exception-and-waiver-request.md.
│           Must be time-boxed and independently approved.
│     → NO / unclear ⚑ → the intent is undefined; STOP and clarify intent before
│           routing. An unclassified deviation must not be built. ↩ §19.
│
├─ QB4: (divergence already exists) Was it AUTHORIZED at the time (an approved
│        ACR or a granted, still-valid exception covers it)?
│     → YES → QB4a: Is it within the terms/expiry of that authorization?
│           → YES ⇒ LEAF-B1: conformant-with-authorization. No new action; verify
│                  the authorization record exists (else it's really QB4→NO).
│           → NO (expired/exceeded terms) ⇒ ROUTE: DRIFT. ↩ Tree F. The
│                  authorization lapsed; reality now diverges without cover.
│     → NO (unauthorized divergence) ⇒ ROUTE: DRIFT. ↩ Tree F.
│           references/09 + workflows/drift-detection-and-remediation.md.
│
└─ QB5 (orthogonal, can co-apply): Does the divergence represent a COMPROMISE we
      are choosing to carry (a shortcut with future cost), regardless of the
      above routing?
      → YES ⇒ ALSO ROUTE: DEBT (in addition to the primary route). ↩ Tree J.
            Debt is the LEDGER of the cost; it does not replace the change/
            exception/drift decision — it records the interest on it.
```

### 6.1 The four-way distinction, stated plainly

| Situation | Timing | Intent about the baseline | Routes to |
| --- | --- | --- | --- |
| **Change** | Not yet built | *Make it the new baseline* (permanent) | ACR (`references/05`) |
| **Exception** | Not yet built (or ongoing) | *Deviate temporarily; baseline stays* | Waiver (`references/08`) |
| **Drift** | Already happened | *Unauthorized / lapsed* — was never sanctioned | Drift finding (`references/09`) |
| **Debt** | Any | *We accept a costly compromise to track* | Debt item (`references/07`) |

> **The load-bearing insight:** *Drift is divergence that escaped governance.* The
> only legitimate dispositions for it are **remediate**, **waive** (retroactively
> time-box and accept, via Tree F/E), or **promote to a change** (adopt it as the
> new baseline, via Tree F/B). It is **never** silently accepted (`SKILL.md` §8).

---

## 7. Tree C — Which authority decides? (authority-resolution tree)

Invoked by nearly every other tree. Resolves *the lowest competent authority* per
the principle of least authority (`SKILL.md` §6).

```
C-START ─ a decision needs an authority
│
├─ QC1: Does the decision touch a FROZEN-BASELINE INVARIANT, a SECURITY/
│        COMPLIANCE control, or a CROSS-DOMAIN CONTRACT? (the Q5 backstop)
│     → YES ⚑ → minimum authority = ARB; self-approval forbidden → QC4
│     → NO  → QC2
│
├─ QC2: Is the BLAST RADIUS confined to a SINGLE domain?
│     → YES → QC3
│     → NO (spans domains) ⇒ AUTHORITY = ARB (escalates to Chief Architect).
│
├─ QC3: What is the SEVERITY (↩ Tree L if unknown)?
│     → S3/S4 ⇒ AUTHORITY = Domain Architecture Owner (may decide locally).
│     → S2    ⇒ AUTHORITY = Domain Architecture Owner WITH recorded rationale;
│                escalate to ARB if contested or if it sets precedent.
│     → S1    ⚑ → QC4
│
├─ QC4: (S1 or baseline/security/cross-domain) Is the REQUESTER also the only
│        available approver?
│     → YES ⚑ ⇒ VIOLATION-GUARD: self-approval forbidden. Escalate to the next
│           authority (ARB; then Chief Architect / CTO). No decision until an
│           independent authority acts.
│     → NO  ⇒ AUTHORITY = ARB (S1 within tolerance) or Chief Architect / CTO
│           (S1 high-severity, time-boxed waivers, baseline-invariant changes).
│
└─ QC5 (always): Is the required authority UNAVAILABLE and the matter URGENT?
      → YES ⇒ route to the EMERGENCY path (Tree K-Q4): a higher delegate may make
            a time-boxed provisional decision that MUST be ratified retroactively
            by the proper authority within the defined window. Provisional ≠
            permanent; unratified provisional decisions auto-expire.
      → NO  ⇒ use the resolved authority above.
```

### 7.1 Authority resolution summary

| Scope × Severity | S4 | S3 | S2 | S1 |
| --- | --- | --- | --- | --- |
| Single domain, no baseline/sec/x-domain | Owner | Owner | Owner (+rationale) | ARB |
| Cross-domain OR baseline/sec/compliance | ARB | ARB | ARB | ARB → Chief Architect/CTO |

> Self-approval is forbidden on the entire S1 row and anywhere the `⚑` fires,
> regardless of scope.

---

## 8. Tree D — ADR: needed, new, supersede, or none?

```
D-START ─ a decision is being (or has been) made
│
├─ QD1: Is the decision ARCHITECTURALLY SIGNIFICANT? (affects structure, a
│        cross-component contract, a quality attribute at system scale, a
│        baseline element, or is costly/hard to reverse)
│     → NO ⇒ LEAF-D-NONE: no ADR required. Below ADR altitude (Tree A-QA3).
│           Record locally in the delivery team if at all.
│     → YES → QD2
│
├─ QD2: Does an ADR ALREADY cover this decision area?
│     → NO  ⇒ ROUTE: NEW ADR. references/02 +
│           workflows/adr-authoring-and-approval.md. Authority ↩ Tree C.
│           Artifact (on request): templates/adr-template.md.
│     → YES → QD3
│
├─ QD3: Does the new decision CONTRADICT or REPLACE the existing ADR?
│     → YES ⇒ ROUTE: SUPERSEDE. Author a new ADR that supersedes the old;
│           maintain the supersession chain; the old ADR → Superseded (not
│           deleted). Authority to supersede = the original authority or higher
│           (↩ Tree C). references/02.
│     → NO → QD4
│
├─ QD4: Does the new decision merely REFINE/EXTEND the existing ADR without
│        contradicting it?
│     → YES ⇒ ROUTE: AMEND/LINK. Add a linked follow-on ADR or an amendment per
│           references/02 conventions; do not silently edit an Accepted ADR's
│           decision.
│     → NO → QD5
│
└─ QD5: Is the existing ADR now IRRELEVANT (the context it decided no longer
        exists)?
      → YES ⇒ ROUTE: DEPRECATE/RETIRE the ADR per references/02 lifecycle
            (Proposed→Accepted→Deprecated/Retired). Record why. Authority ↩ Tree C.
      → NO  ⇒ LEAF-D-NOOP: existing ADR stands; no new decision record needed.
```

---

## 9. Tree E — Exception vs. waiver, and who may grant it

```
E-START ─ someone wants permission to deviate from the baseline/a control
│
├─ QE1: Is the deviation from a SECURITY/COMPLIANCE control or a FROZEN-BASELINE
│        INVARIANT or a CROSS-DOMAIN CONTRACT?
│     → YES ⚑ ⇒ this is a WAIVER (high-severity, S1), NOT a routine exception.
│           Must be time-boxed, conditions-bound, and granted by ARB → Chief
│           Architect/CTO (Tree C-QC4). Never self-approved. → QE3
│     → NO  → QE2
│
├─ QE2: Severity of the deviation (↩ Tree L)?
│     → S3/S4 ⇒ EXCEPTION. Domain Architecture Owner may grant, time-boxed,
│           recorded. references/08.
│     → S2    ⇒ EXCEPTION. Owner grants with rationale; ARB if precedent-setting.
│     → S1    ⚑ → treat as WAIVER → QE3
│
├─ QE3: Is it TIME-BOXED with a defined expiry and remediation condition?
│     → NO ⚑ ⇒ CANNOT GRANT. An open-ended deviation is forbidden (the "permanent
│           temporary" anti-pattern, references/16 §12.5). Require an expiry and a
│           remediation plan first.
│     → YES → QE4
│
├─ QE4: Is the REQUESTER also the sole APPROVER?
│     → YES ⚑ ⇒ VIOLATION-GUARD: forbidden (SKILL.md §8). Route to independent
│           authority (Tree C).
│     → NO → QE5
│
└─ QE5: Is this a RENEWAL of an existing exception?
      → YES → QE5a: How many times has it been renewed?
            → within threshold ⇒ renew, time-boxed, re-approved by authority.
            → beyond threshold ⚑ ⇒ STOP renewing. A repeatedly-renewed exception
                  is structural — PROMOTE it: either fix (remediate) or adopt as a
                  baseline CHANGE (↩ Tree B/D). Recurring exceptions feed evolution
                  (references/06, references/08).
      → NO  ⇒ GRANT (or deny) per authority; record with expiry + conditions.
            Artifacts (on request): templates/exception-request.md, waiver-record.md.
```

---

## 10. Tree F — Drift finding disposition

```
F-START ─ divergence from the baseline detected (from Tree B-QB4, or references/09)
│
├─ QF1: Is the drift CONFIRMED (real divergence, not a detection false-positive)?
│     → NO ⇒ close as false-positive; record to tune detection (references/09).
│     → YES → QF2
│
├─ QF2: Classify severity (↩ Tree L). Does it breach a baseline invariant,
│        security/compliance control, or cross-domain contract?
│     → YES ⚑ ⇒ S1 CRITICAL DRIFT. BLOCKS release (Tree G). Immediate
│           escalation to ARB. Choose disposition among QF3 — but "accept
│           silently" is NOT an option.
│     → NO  → QF2 assigns S2/S3/S4 → QF3
│
├─ QF3: Choose the DISPOSITION (exactly one; silent acceptance forbidden):
│     ├─ REMEDIATE ⇒ bring reality back to the baseline. Emit a DIRECTIVE to the
│     │     delivery line (no code here). Track to closure (references/09). Default
│     │     for S1/S2.
│     ├─ WAIVE ⇒ the divergence is acceptable for now: retroactively time-box and
│     │     accept it ↩ Tree E (waiver). Requires the waiver authority. Converts
│     │     ungoverned drift into a governed, expiring deviation.
│     └─ PROMOTE-TO-CHANGE ⇒ the divergence is actually better: adopt it as the
│           new baseline ↩ Tree B-QB2 → Tree D (ADR) + ACR. The running system
│           becomes the baseline through the front door, not silently.
│
└─ QF4: Regardless of disposition, is there a CARRIED COST/shortcut?
      → YES ⇒ ALSO log DEBT (↩ Tree J). Artifact (on request):
            templates/drift-finding-report.md.
```

---

## 11. Tree G — Release approval: go / conditional / no-go

```
G-START ─ a release seeks architecture approval (references/11,
          workflows/release-architecture-approval.md,
          checklists/release-approval-checklist.md)
│
├─ QG1: Is there any UNRESOLVED S1 drift, S1 audit finding, or unratified S1
│        baseline change in scope of this release?
│     → YES ⚑ ⇒ NO-GO. Release blocked. An S1 open item is a hard stop
│           (references/11). Escalate; do not conditionally approve around an S1.
│     → NO → QG2
│
├─ QG2: Is the release EVIDENCE PACK complete (baseline diff, drift status,
│        exception status, dependency status, gate checklist)?
│     → NO ⇒ CANNOT DECIDE. Approval is evidence-based; missing evidence = not
│           ready. Return for evidence (not a no-go, a not-yet).
│     → YES → QG3
│
├─ QG3: Are there OPEN S2 items with accepted, time-boxed risk and a remediation
│        plan signed by the proper authority?
│     → NO (open S2 without accepted risk) ⇒ NO-GO until addressed.
│     → YES → QG4
│
├─ QG4: Do any conditions need to hold post-release (monitoring, a follow-up
│        remediation, a time-boxed waiver)?
│     → YES ⇒ CONDITIONAL GO. Approve with explicit, recorded conditions and
│           expiries; assign condition owners; schedule verification.
│     → NO  ⇒ GO. Full architecture approval.
│
└─ Authority: ARB (release gate) → Chief Architect (Tree C). Artifact (on
   request): templates/release-architecture-approval-record.md.
```

---

## 12. Tree H — Sprint approval: pass / conditional / escalate

```
H-START ─ a sprint seeks architecture approval (references/12,
          workflows/sprint-architecture-approval.md,
          checklists/sprint-approval-checklist.md)
│
├─ QH1: Did the sprint introduce any BASELINE-affecting change, cross-domain
│        dependency, or new exception?
│     → NO ⇒ LEAF-H-LIGHT: lightweight pass. Domain Owner (or delegate) confirms
│           no architectural significance; record the sprint approval.
│     → YES → QH2
│
├─ QH2: Was each such item PROPERLY ROUTED during the sprint (ACR / exception /
│        ADR raised as required — verify via the relevant tree)?
│     → NO ⚑ ⇒ CONDITIONAL / ESCALATE. Unrouted architectural change in a sprint
│           is itself a drift/governance gap. Route it now (↩ Tree B) before
│           approving; escalate if S1.
│     → YES → QH3
│
├─ QH3: Any UNRESOLVED S1 in the sprint's scope?
│     → YES ⚑ ⇒ ESCALATE to ARB; sprint not architecturally clear.
│     → NO  → QH4
│
└─ QH4: Conditions needed (a follow-up ADR, a debt item, a monitoring task)?
      → YES ⇒ CONDITIONAL PASS with recorded conditions + owners.
      → NO  ⇒ PASS. Authority: Domain Owner (delegated reviewer); ARB on
            escalation (Tree C). Artifact (on request):
            templates/sprint-architecture-approval-record.md.
```

---

## 13. Tree I — Cross-domain dependency: allowed / contract / block

```
I-START ─ a dependency between domains is proposed or discovered (references/10)
│
├─ QI1: Is the dependency ALREADY GOVERNED by a registered, current contract?
│     → YES → QI2
│     → NO  → QI3
│
├─ QI2: Does the proposed use stay WITHIN the existing contract's terms?
│     → YES ⇒ LEAF-I-OK: allowed under the existing contract. No new decision;
│           verify the dependency register reflects it.
│     → NO  ⚑ ⇒ the contract must change: cross-domain ⇒ ARB authority; treat the
│           contract change as a CHANGE (↩ Tree B/D) + dependency-register update.
│
├─ QI3: (no contract yet) What is the BLAST RADIUS if the dependency fails or
│        changes?
│     → contained / low ⇒ ESTABLISH CONTRACT: register the dependency, define the
│           contract (interface, SLA, versioning, ownership on both sides). ARB
│           ratifies cross-domain contracts. references/10 +
│           templates/cross-domain-dependency-entry.md.
│     → high / systemic ⚑ ⇒ ARB (→ Chief Architect) decision required BEFORE the
│           dependency is created. May BLOCK if it creates unacceptable coupling
│           or a cyclic dependency.
│
└─ QI4: Would this create a DEPENDENCY CYCLE between domains?
      → YES ⚑ ⇒ BLOCK by default. Cyclic cross-domain dependencies are an
            architectural defect; escalate to ARB for a deliberate ruling and,
            if unavoidable, a governed, time-boxed exception (↩ Tree E) plus a
            remediation roadmap (references/06).
      → NO  ⇒ proceed with the contract from QI3.
```

---

## 14. Tree J — Technical debt: accept / reject / must-fix-now

```
J-START ─ a compromise/shortcut is proposed or identified (references/07)
│
├─ QJ1: Does the "debt" actually BREACH a baseline invariant, security/compliance
│        control, or cross-domain contract?
│     → YES ⚑ ⇒ NOT debt to be accepted — it's an S1 issue. Route to CHANGE
│           (fix via ACR) or, if truly unavoidable short-term, a WAIVER (↩ Tree
│           E), never a quietly-logged debt item. Debt is not a hiding place for
│           S1 breaches.
│     → NO → QJ2
│
├─ QJ2: Is the debt being taken KNOWINGLY and deliberately (a chosen trade-off)?
│     → YES → QJ3
│     → NO (discovered/accidental debt) ⇒ log it, classify, schedule assessment;
│           it still enters the ledger (references/07).
│
├─ QJ3: Has the INTEREST (ongoing cost) and PRINCIPAL (cost to fix) been
│        estimated, and an owner assigned?
│     → NO ⇒ CANNOT ACCEPT yet: estimate interest/principal and assign an owner
│           first (references/07). Unquantified debt is invisible debt.
│     → YES → QJ4
│
├─ QJ4: Is the interest ACCEPTABLE for the intended carry period (authority per
│        Tree C: Owner for S3/S4, ARB for S2/precedent)?
│     → YES ⇒ ACCEPT: record in the debt ledger with severity, interest,
│           principal, owner, and a review/paydown schedule.
│           templates/technical-debt-item.md.
│     → NO  ⇒ REJECT acceptance: the debt must be paid down now or the underlying
│           work rescoped. Emit a DIRECTIVE to the delivery line (no code here).
│
└─ QJ5: Is this debt RECURRING (the same shortcut keeps returning)?
      → YES ⇒ feed to EVOLUTION (references/06) — recurring debt signals a
            structural gap the roadmap should address, not an item to re-log
            forever.
```

---

## 15. Tree K — Escalation: decide locally or escalate?

```
K-START ─ "can I decide this, or must it go up?"
│
├─ QK1: Is the matter WITHIN the deciding role's mandate (per Tree C authority
│        resolution)?
│     → YES → QK2
│     → NO  ⚑ ⇒ ESCALATE to the resolved higher authority (Tree C). Deciding
│           beyond one's mandate is a governance violation, even if the decision
│           is "right."
│
├─ QK2: Is there a genuine DISPUTE (two authorities disagree, or a stakeholder
│        contests the decision)?
│     → YES ⇒ route to workflows/escalation-and-dispute-resolution.md. Record the
│           dispute; do not suppress it (references/17 §12.3). Escalate to the
│           lowest authority that spans both parties.
│     → NO  → QK3
│
├─ QK3: Does the decision set a PRECEDENT beyond this instance?
│     → YES ⇒ escalate one level so the precedent is set by the right altitude,
│           even if this instance is low-severity.
│     → NO  → QK4
│
└─ QK4: Is the proper authority UNAVAILABLE and the matter genuinely URGENT?
      → YES ⇒ EMERGENCY provisional decision by a higher delegate, time-boxed,
            MUST be ratified retroactively within the window; auto-expires if not
            (Tree C-QC5). Record the emergency invocation.
      → NO  ⇒ decide locally within mandate; record.
```

---

## 16. Tree L — Severity classification (S1–S4)

Invoked whenever a node needs a severity. Deterministic against
`references/15` / `SKILL.md` §7.

```
L-START ─ classify the severity of an issue/deviation/finding
│
├─ QL1: Does it violate a FROZEN-BASELINE INVARIANT, a SECURITY/COMPLIANCE
│        control, or a CROSS-DOMAIN CONTRACT?
│     → YES ⇒ S1 — CRITICAL. Blocks release; no self-approval. STOP (highest).
│     → NO  → QL2
│
├─ QL2: Does it MATERIALLY diverge from the baseline or an ADR, but is CONTAINED
│        within one domain?
│     → YES ⇒ S2 — MAJOR. Owner/ARB adjudication + remediation plan required.
│     → NO  → QL3
│
├─ QL3: Is it a LOW-blast-radius or cosmetic divergence?
│     → YES ⇒ S3 — MINOR. Owner may handle with a recorded exception.
│     → NO  → QL4
│
└─ QL4: Is it purely informational (a trend signal, no gate impact)?
      → YES ⇒ S4 — INFORMATIONAL. Note for trends; no gate impact.
      → NO / genuinely unclear ⚑ ⇒ default UP: treat as the NEXT-higher severity
            until evidence lowers it. Under-classification is the dangerous error.
```

> **Precautionary severity rule:** when severity is genuinely ambiguous, classify
> *up*, not down. The cost of over-escalating an S3 is a little ceremony; the cost
> of under-classifying an S1 is an unprotected baseline. This asymmetry drives the
> `⚑` default-up on QL4.

---

## 17. Tie-breaking and precedence rules across trees

When more than one route seems to apply, resolve deterministically in this order:

1. **Out-of-scope wins first.** If the request asks for code/IaC/etc., it is
   declined regardless of any governance angle (master Q1).
2. **The Q5 backstop dominates severity.** Baseline-invariant / security /
   cross-domain ⇒ S1 and no self-approval, overriding any lower classification a
   sub-tree would assign.
3. **Drift beats convenience.** If a divergence *already exists* and was *not
   authorized*, it is drift (Tree F) — it may not be re-labeled "debt" or "minor
   exception" to avoid a finding.
4. **Change over exception for permanence.** If the intent is to make a divergence
   permanent, it is a change (ACR), not an ever-renewed exception (Tree E-QE5
   promotes repeat exceptions to changes).
5. **Higher authority over lower.** When two authorities could act, the *lowest
   competent* decides — but ties or cross-mandate disputes escalate (Tree K), they
   do not get resolved by whoever acts first.
6. **Debt is additive, never substitutive.** Logging debt (Tree J) never replaces
   the primary change/exception/drift decision; it records the cost alongside it
   (Tree B-QB5).
7. **Precautionary severity.** Ambiguous severity classifies up (Tree L-QL4).
8. **Safe default up.** If no leaf fits, escalate rather than force-fit (§19).

---

## 18. Multi-function requests — decomposition procedure

Real requests bundle actions ("adopt the divergence as the new baseline, waive the
gap until it ships, and log the shortcut we took"). Handle as:

1. **List the atomic governance intents** in the request (here: a *change*, a
   *waiver*, and a *debt item*).
2. **Order them by dependency** — the change decision (Tree B/D) comes first
   because the waiver and debt hang off it.
3. **Traverse one tree per intent**, carrying shared facts (severity, scope,
   authority) between them so they stay consistent.
4. **Reconcile authorities** — all sub-decisions inherit the *highest* authority
   any one of them requires (a bundle touching a baseline invariant is ARB-level
   throughout).
5. **Record the linkage** — the ADR, waiver, and debt item cross-reference each
   other (they describe one situation from three governance angles).
6. **Never let a convenient sub-route lower the severity of the bundle** (§17.2).

---

## 19. When no tree fits — the safe-default path

If traversal reaches a point where no leaf applies, or a node's answer is
genuinely unknowable from available evidence:

```
SAFE-DEFAULT
│
├─ SD1: Is a fact missing that would let a tree route?
│     → YES ⇒ OUTPUT: "cannot route until <fact> is established." Name the fact
│           and its owner. Do NOT guess a route. (Determinism principle, §3.)
│     → NO  → SD2
│
├─ SD2: Is the situation novel (a genuinely new kind of governance question)?
│     → YES ⇒ ESCALATE to the ARB as an unclassified matter. The ARB decides the
│           route AND whether a new tree/branch is needed (governed change to this
│           file, §22). Do not improvise a permanent process from one instance.
│     → NO  → SD3
│
└─ SD3: Default posture ⇒ ADVISORY-ONLY. Render the assessment and the options
      with their authorities; take NO recording action; recommend the safest
      conservative path (usually: treat as higher severity, route up, protect the
      baseline). Never force-fit into a convenient process to "close" it.
```

> The safe default always errs toward **more governance, higher authority, and no
> silent action** — never toward convenience.

---

## 20. Worked traversals (four end-to-end examples)

### 20.1 "The team already swapped the cache layer in prod; it's fine, just note it."

- Master: Q1 no code asked → Q2 frozen baseline exists → Q3 advisory → Q4 primary
  intent = "reality diverged" → **Tree B**.
- Tree B: QB1 *already happened* → QB4 authorized? **No approved ACR/exception** →
  **ROUTE: DRIFT** → **Tree F**.
- Tree F: QF1 confirmed → QF2 does the cache layer touch a cross-domain contract or
  baseline invariant? Suppose **yes** (baseline element) → **S1 CRITICAL DRIFT**,
  `⚑` blocks release → QF3 disposition. "It's fine, just note it" (silent accept)
  is **not an option**. Choose: remediate, waive (Tree E, ARB, time-boxed), or
  promote-to-change (Tree B/D + ACR).
- **Outcome:** *Not* "noted." An S1 drift finding, escalated to ARB, with one of
  three governed dispositions. The casual framing is rejected by Tree F.

### 20.2 "Approve the payments release; there's one open S2 with a plan."

- Master → Q4 = approve release → **Tree G**.
- QG1 unresolved S1? No → QG2 evidence pack complete? Yes → QG3 open S2 with
  accepted, time-boxed risk + authority-signed plan? **Yes** → QG4 post-release
  conditions? Yes (monitor + remediate S2) → **CONDITIONAL GO**.
- **Outcome:** Conditional architecture approval by the ARB, with recorded
  conditions, owners, and a verification date. Artifact on request: release
  approval record.

### 20.3 "Grant a waiver so team X can skip the encryption-at-rest control for this quarter."

- Master: Q5 backstop — security/compliance control → `⚑` **S1, ARB minimum, no
  self-approval** → Q4 = deviation permission → **Tree E**.
- QE1 security/compliance control? **Yes** `⚑` → **WAIVER**, not routine exception →
  QE3 time-boxed with remediation? Must confirm an expiry + plan (else cannot
  grant) → QE4 requester = sole approver? Must be **no** → **Authority: ARB →
  Chief Architect/CTO**.
- **Outcome:** Advisory route = a time-boxed S1 waiver requiring ARB/CTO grant with
  a remediation condition; *this skill does not grant it* and never writes the code
  to disable encryption — it routes to the authority and, if asked, records the
  waiver artifact once granted.

### 20.4 "We keep waiving the same logging gap every quarter — just renew it again."

- Master → Q4 = deviation permission (renewal) → **Tree E**.
- QE5 renewal? Yes → QE5a renew count **beyond threshold** `⚑` → **STOP renewing.
  PROMOTE:** either remediate the logging gap or adopt it as a baseline change
  (Tree B/D). Feed the recurrence to evolution (`references/06`).
- **Outcome:** The tree refuses the easy renewal and forces the "permanent
  temporary" into a real change or fix — exactly the anti-pattern the maturity
  model and audit both hunt for (`references/16` §12.5, `references/17` §14.1).

---

## 21. Anti-patterns in routing

- **21.1 Convenient relabeling.** Calling drift "debt," or a change "a minor
  exception," to reach a lower authority or avoid a finding. Defeated by Tree B's
  timing/intent nodes and §17.3.
- **21.2 Flag-skipping.** Traversing past a `⚑` because the answer is inconvenient.
  Every `⚑` is a hard stop; skipping one is an audit finding (`references/17`).
- **21.3 Severity-downgrading to self-approve.** Classifying an S1 as S2/S3 so the
  local owner can approve it. Defeated by the Q5 backstop and precautionary
  severity (Tree L-QL4).
- **21.4 Force-fitting the novel case.** Jamming a genuinely new situation into the
  nearest existing process to "close" it, instead of escalating (§19-SD2).
- **21.5 Deciding beyond mandate because the answer seems obvious.** A right
  decision by the wrong authority is still a governance violation (Tree K-QK1).
- **21.6 Bundling to blur severity.** Merging a high-severity item into a bundle of
  low-severity ones and approving the bundle at the low authority. Defeated by
  §18.4 (bundle inherits the highest authority).

---

## 22. Integration with the operating model

- **Who owns these trees.** The governance function owns this file; the ARB
  governs changes to it. Because the trees encode *who may decide what*, changing
  them changes the authority model — so edits follow the same change discipline as
  any governance artifact (proposed, reviewed, ARB-approved, versioned), like the
  maturity rubric (`references/16` §11.2) and audit criteria (`references/17` §7.3).
- **Versioning.** A routing decision cites the tree version it used, so historical
  routings remain auditable (`references/17`).
- **How the trees feed audit.** Governance audit tests *routing conformance* — did
  real decisions follow the path the trees prescribe, by the right authority?
  Misrouting is a finding.
- **How the trees feed maturity.** Consistent, evidenced routing is a Level-3+
  signal (standardized process); improvised routing is Level 1.
- **Read-only throughout.** Traversal produces a recommended route and the
  authority to ratify it. It records nothing unless explicitly asked, and it never
  emits code — where a route implies code, it emits a directive to the delivery
  line and stops (master Q1).

---

## 23. Appendix A — consolidated quick-routing table

| If the request is… | Enter | Key discriminator | Lands on |
| --- | --- | --- | --- |
| "build/change the code" | Master Q1 | asks for code | OUT OF SCOPE (directive only) |
| "change the architecture" | Tree B → D | permanent? not-yet-built? | ACR + ADR (`05`/`02`) |
| "let us deviate" | Tree E | security/baseline? time-boxed? | Exception/Waiver (`08`) |
| "it already diverged" | Tree F | authorized? severity? | Drift finding (`09`) |
| "track this shortcut" | Tree J | breaches invariant? quantified? | Debt item (`07`) |
| "record this decision" | Tree D | significant? supersede? | ADR (`02`) |
| "approve the release" | Tree G | open S1? evidence pack? | Release record (`11`) |
| "approve the sprint" | Tree H | baseline-affecting? routed? | Sprint record (`12`) |
| "a cross-domain dependency" | Tree I | contract? blast radius? cycle? | Dependency entry (`10`) |
| "who decides?" | Tree C | scope × severity × baseline | Authority (`00`/`13`) |
| "how bad is it?" | Tree L | invariant? contained? | Severity S1–S4 (`15`) |
| "decide or escalate?" | Tree K | mandate? dispute? precedent? | Escalation (`00`) |
| "assure our governance" | — | assurance | Audit (`17`) |
| "grade our governance" | — | maturity | Maturity (`16`) |
| novel / unclear | §19 | missing fact? novel? | Safe default: escalate/advisory |

---

## 24. Appendix B — the one-page master flow

```
                         ┌──────────────────────┐
     request/situation → │  MASTER TRIAGE (§4)   │
                         └───────────┬───────────┘
        asks for code? ──YES──▶ OUT OF SCOPE (directive only, never build)
              │NO
   frozen baseline exists? ──NO──▶ Tree A (Review / SSOT / Freeze)
              │YES
   ┌──────────┴───────────── primary intent (Q4) ─────────────────────────┐
   ▼        ▼        ▼        ▼        ▼        ▼        ▼        ▼         ▼
 change  decision  deviate  diverged  shortcut release  sprint   x-domain  who/how
  (B→D)   (D)       (E)      (F)       (J)      (G)      (H)      (I)      (C/L/K)
   │        │        │        │         │        │        │        │         │
   └────────┴────────┴────────┴─────────┴────────┴────────┴────────┴─────────┘
                                  │
             ┌────────────────────┴────────────────────┐
             │  Q5 BACKSTOP (runs on EVERY path):        │
             │  baseline invariant / security-compliance │
             │  / cross-domain contract touched?         │
             │     YES ⚑ → S1, no self-approval, ARB min  │
             └───────────────────────────────────────────┘
                                  │
                     authority ratifies (advisory until then)
                                  │
                     record ONLY if explicitly requested
```

---

## 25. Appendix C — glossary deltas

Terms introduced by this reference (add to
`references/15-glossary-and-taxonomy.md`):

- **Governance decision tree** — a deterministic, node-by-node routing structure
  that maps a request/situation to the correct function, authority, process, and
  outcome.
- **Master triage tree** — the mandatory entry tree every request passes through
  (§4).
- **Q5 backstop** — the always-on guard that forces S1 and forbids self-approval
  whenever a baseline invariant, security/compliance control, or cross-domain
  contract is touched (§4).
- **The great confusion (change/exception/drift/debt)** — the four-way routing of
  identical "divergence" facts by timing, intent, and permanence (Tree B, §6.1).
- **Determinism principle** — same facts, same route, every time (§3).
- **Precautionary severity** — classifying up when severity is ambiguous (Tree L,
  §16).
- **Promote-to-change** — adopting an existing divergence as the new baseline
  through the front door rather than accepting it silently (Tree F, Tree E-QE5).
- **Provisional (emergency) decision** — a time-boxed decision by a higher delegate
  when the proper authority is unavailable, requiring retroactive ratification or
  auto-expiry (Tree C-QC5, Tree K-QK4).
- **Safe-default path** — the escalate-and-advise route taken when no leaf fits;
  always errs toward more governance and no silent action (§19).
- **Routing conformance** — the audit property that real decisions followed the
  tree-prescribed path and authority (§22).
- **`⚑` (mandatory stop)** — a node past which traversal cannot proceed without the
  named authority; skipping one is a routing violation (§2.1, §21.2).

---

*Governance Decision Trees — the routing brain. They turn any request into a
deterministic path: the right function, the right authority, the right process,
and an outcome that is recorded only on request and never, ever code.*
