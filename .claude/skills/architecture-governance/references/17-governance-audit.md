# Architecture Governance — Governance Audit

> **Scope.** This reference defines how a large enterprise **audits its own
> architecture governance** — how it verifies, with independent and inspectable
> evidence, that the governance processes defined across this skill are actually
> being performed as designed, that their records are trustworthy, and that
> deviations are found, reported, and remediated.
>
> **Read-only contract.** Auditing is, by its nature, a **read-only, evidence-
> gathering** discipline. An audit *observes and reports*; it does not change the
> thing it audits, and it never generates production code. Audit findings are
> advisory until formally issued; an audit report is recorded as an artifact only
> when the audit is formally commissioned and its issuance is explicitly
> requested. See `SKILL.md` §2.
>
> **Relationship to the rest of the skill.** The governance audit is the
> *assurance* layer. Where the maturity model
> (`references/16-governance-maturity-model.md`) asks *"how good is our
> governance?"*, the audit asks the sharper, binary question *"is governance
> actually happening the way we say it is, and can we prove it?"* It draws its
> criteria from every other reference (`00`–`14`), its metrics from
> `references/14-metrics-kpis-and-reporting.md`, its authority from
> `references/00-governance-operating-model.md`, and its vocabulary from
> `references/15-glossary-and-taxonomy.md`.

---

## Table of contents

1. Purpose — assurance vs. assessment
2. The independence principle (why audit sits apart)
3. The three lines of defense model
4. Types of governance audit
5. Audit universe and risk-based planning
6. The audit lifecycle (end-to-end)
7. Audit criteria — what "conformance" means
8. Evidence: sufficiency, reliability, and the audit trail
9. Sampling methodology
10. Testing techniques (walkthroughs, re-performance, tracing)
11. Findings — classification, rating, and framing
12. The management response and remediation lifecycle
13. Audit reporting
14. Continuous auditing and control automation
15. Auditing each governance function (control catalog)
16. The immutable audit trail — requirements
17. Auditor conduct, ethics, and conflicts
18. Quality assurance of the audit function itself
19. Relationship to external/regulatory audit
20. Anti-patterns in governance auditing
21. Worked example — an ADR/register conformance audit
22. Integration with the operating model
23. Appendix A — control catalog (full)
24. Appendix B — audit working-paper template
25. Appendix C — finding write-up template
26. Appendix D — glossary deltas

---

## 1. Purpose — assurance vs. assessment

### 1.1 What a governance audit is

A governance audit provides **independent, objective assurance** that the
architecture governance system is:

- **Designed adequately** — the controls (processes, gates, records, authorities)
  defined across this skill are capable, if operated, of achieving governance
  objectives; and
- **Operating effectively** — those controls are actually being performed, by the
  right people, at the right time, leaving the right evidence.

Assurance is a binary-leaning judgment against a **fixed criterion**: *does the
observed reality conform to the defined control, yes or no, and with what
exceptions?* This is deliberately different from maturity assessment, which is a
graded judgment on a spectrum.

### 1.2 Audit vs. maturity assessment — a sharp distinction

| Dimension | Governance audit (`this file`) | Maturity assessment (`references/16`) |
| --- | --- | --- |
| Core question | "Is the control operating as designed?" | "How good is this capability, on a scale?" |
| Output | Conformance / non-conformance + findings | A 0–5 score + roadmap |
| Judgment shape | Binary-leaning (conform / exception) | Graded (spectrum) |
| Against what | A specific, documented control | A capability rubric |
| Posture | Assurance / verification | Diagnosis / improvement |
| Independence | **Mandatory and structural** (§2) | Independent scoring, less structurally separated |
| Typical consumer | ARB, risk committee, external auditors | Governance function, roadmap owners |
| Failure to act on it | A control gap / assurance failure | A missed improvement opportunity |

They are complementary. Maturity says *where you are*; audit says *whether the
records that describe where you are can be trusted at all.* A high maturity score
built on an unauditable trail is worthless — which is precisely why the maturity
model discounts self-report (`references/16` §7.4) and why audit exists.

### 1.3 What a governance audit is NOT

- **Not a performance appraisal** of architects. It tests *controls*, not people.
- **Not a redesign of governance.** An audit reports gaps; fixing them is
  management's job (the second line), tracked through remediation (§12).
- **Not advisory consulting.** The auditor's independence (§2) is compromised the
  moment they design the control they later audit. Audit *reports*; it does not
  *build*.
- **Not code review, security testing, or QA.** Those are delivery-line controls;
  the audit may test *whether they were governed*, not perform them.

---

## 2. The independence principle (why audit sits apart)

Independence is the single non-negotiable property of a governance audit. An
assurance that is not independent is not assurance — it is self-certification, and
self-certification is exactly the failure mode governance exists to prevent
(`SKILL.md` §8: "approve its own exceptions" is forbidden; the same logic applies
to auditing one's own governance).

### 2.1 Two forms of independence

- **Independence of mind** — the auditor forms conclusions without being
  influenced by the interests of those audited.
- **Independence in appearance** — the auditor's *structural position* is such
  that a reasonable observer would not doubt their objectivity.

Both are required. A technically objective auditor who reports to the owner of the
process being audited fails independence *in appearance*, and that is
disqualifying regardless of their integrity.

### 2.2 The separation rule

> **The person or body that performs, owns, or approves a governance control may
> not audit that same control.**

Concretely:

- The Domain Architecture Owner who approves ADRs cannot audit ADR conformance in
  their own domain.
- The ARB, which is the change-approval authority, cannot be the sole auditor of
  the change-management control.
- The governance function that operates the register cannot provide the only
  assurance over register integrity.

Independence is achieved by **who reports to whom** (§3) and by **rotation and
peer-crossing** (a domain audits a *different* domain's controls, or an
independent internal-audit function does).

### 2.3 Independence and this skill's read-only posture

The audit's read-only nature is not merely a safety rule — it is *what makes it an
audit*. An actor that can change the records it inspects cannot provide assurance
over them. This is why the governance-audit function, uniquely, must never write
into the governance artifacts it examines (ADRs, register, approval records) other
than to *record its own audit findings* in the separate audit trail (§16).

---

## 3. The three lines of defense model

Governance audit is the **third line** in the standard three-lines assurance
model. Understanding the lines prevents the most common confusion — expecting the
audit to *fix* what it finds.

| Line | Who | Role in governance | Example |
| --- | --- | --- | --- |
| **First line** | The teams doing the work; Domain Architecture Owners | *Own and operate* the controls — write ADRs, run gates, keep the register. | An owner records an ADR and approves it per authority. |
| **Second line** | The governance function; ARB; risk/compliance | *Design, oversee, and monitor* the controls; set policy; watch KPIs. | The governance function defines the ADR lifecycle and monitors coverage. |
| **Third line** | Governance audit (this file); internal audit | *Independently verify* that lines one and two are working. | An auditor tests whether ADRs actually exist for a sample of real decisions. |

**Critical boundaries between the lines:**

- The third line **does not operate** controls (that is the first line) and **does
  not design** them (that is the second line). If it did either, it could no
  longer audit them independently.
- A finding from the third line is **handed to the second line** to drive
  remediation through the first line. The auditor *tracks* remediation to closure
  but does not *perform* it.
- The three lines must be **structurally distinct enough** that the third line's
  reporting path does not run through the owner of the control it audits (§2.2).

> **Small-organization note.** In smaller units full structural separation may be
> impractical. The compensating control is **peer-crossing** (domain A audits
> domain B) plus **periodic independent review** (an external or corporate
> internal-audit pass). What is *never* acceptable is a control's operator being
> its only assurer.

---

## 4. Types of governance audit

Different questions call for different audit types. An audit program (§5) blends
them.

### 4.1 By objective

- **Conformance (compliance) audit** — Does practice conform to the defined
  control? *E.g., are all baseline changes going through the ACR process?* The
  most common governance audit type.
- **Design-adequacy audit** — Is the control, as designed, *capable* of achieving
  its objective even if perfectly operated? *E.g., does the exception process, as
  written, actually prevent permanent temporaries?* Tests the control, not its
  operation.
- **Operating-effectiveness audit** — Is the control operating *consistently over
  a period*, not just at a point? Requires sampling across time (§9).
- **Substantive / outcome audit** — Ignoring process, is the *end state* correct?
  *E.g., does the running system actually match the baseline?* This overlaps with
  drift detection (`references/09`) but is performed independently as assurance.

### 4.2 By trigger

- **Scheduled / cyclical** — planned in the annual audit program (§5).
- **Risk-triggered** — prompted by a spike in a risk indicator (rising emergency-
  change rate, aging exceptions, a maturity score gated at the floor).
- **Event-triggered** — after a governance failure, a reorganization, an
  acquisition, or a major incident with a governance root cause.
- **Follow-up** — verifying that a prior audit's findings were actually remediated
  (§12.5). A remediation is not closed until an independent follow-up confirms it.

### 4.3 By scope

- **Full-function audit** — the whole governance system across a unit.
- **Single-control audit** — one control (e.g., ADR conformance) across many
  units.
- **Thematic audit** — one theme cutting across controls (e.g., "are all frozen
  baselines actually protected?" touching change, drift, and exceptions).
- **Spot check** — a lightweight, unannounced test of a single control on a small
  sample; a deterrent and an early-warning device, not a full audit.

---

## 5. Audit universe and risk-based planning

### 5.1 The audit universe

The **audit universe** is the complete inventory of auditable governance controls
across all units — effectively the cross-product of the control catalog (§15,
Appendix A) and the organizational units it applies to. It is maintained by the
audit function and is the population from which the audit program is drawn.

### 5.2 Risk-based prioritization

Audit resources are finite; the universe is large. Audits are prioritized by
**assurance risk**, not by convenience or rotation alone:

```
Assurance risk = Control criticality × Failure likelihood × Blast radius × Time since last audit
```

- **Control criticality** — S1-critical controls (those gating the maturity floor
  and protecting frozen baselines) are audited most often.
- **Failure likelihood** — informed by KPI signals (`references/14`), prior
  findings, recent change, and maturity gaps.
- **Blast radius** — cross-domain and Tier-1 controls carry more weight.
- **Time since last audit** — assurance decays; a control unaudited for a long
  period accrues risk regardless of its metrics.

### 5.3 Coverage discipline

- Every S1-critical control in every Tier-1/Tier-2 unit must be audited within a
  defined **maximum coverage interval** (e.g., annually for Tier-1).
- No control may go *indefinitely* unaudited merely because its metrics look
  healthy — healthy metrics on an unaudited control are unverified metrics.
- The plan reserves capacity for **risk- and event-triggered** audits; a program
  that is 100% pre-committed cannot respond to emerging risk.

### 5.4 The annual audit program

The program is a governed artifact: proposed by the audit function, reviewed for
independence and coverage, approved by the ARB or the risk committee
(`references/00`), and revisited when risk shifts. It states, per planned audit:
the control(s), the unit(s), the type (§4), the period covered, and the resourcing.

---

## 6. The audit lifecycle (end-to-end)

Every governance audit, regardless of type, follows the same disciplined
lifecycle. This mirrors the rigor the skill imposes on the processes it governs.

### 6.1 Phase 1 — Planning and scoping

- **Define the objective** precisely: which control, which unit, which period,
  which audit type (§4).
- **Establish the criteria** (§7): the exact, documented standard against which
  conformance is judged. Without a fixed criterion there is no audit, only opinion.
- **Confirm independence** (§2): verify the assigned auditor(s) have no
  operating/owning/approving role in the audited control.
- **Assess inherent risk** and set the **materiality threshold** — how large a
  deviation matters (§11.2).
- **Notify** the audited unit (for scheduled audits) and request initial evidence.

### 6.2 Phase 2 — Understanding the control (walkthrough)

- Obtain the control's design from the relevant reference (`00`–`14`).
- Perform a **walkthrough**: trace one instance end-to-end to confirm the auditor
  understands how the control is *supposed* to operate and how it leaves evidence
  (§10.1).
- Confirm **design adequacy** before testing operation — testing whether a broken
  design was followed wastes effort; if the design is inadequate, that is itself a
  finding.

### 6.3 Phase 3 — Testing

- Draw the **sample** (§9) appropriate to the audit type and period.
- Apply **testing techniques** (§10): re-performance, tracing, reconciliation,
  inspection.
- Document every test in **working papers** (§16, Appendix B) — the test
  performed, the population, the sample, the result, and the exception (if any).
- Working papers must be sufficient for a *different* competent auditor to reach
  the same conclusion from them.

### 6.4 Phase 4 — Evaluating results and forming findings

- Aggregate exceptions; determine whether they are **isolated** (one-off
  operational slip) or **systemic** (the control does not reliably work).
- Classify and rate each finding (§11).
- Determine the **root cause** — a finding without a root cause cannot be
  remediated durably (§11.4).

### 6.5 Phase 5 — Clearance and management response

- **Clear the facts** with the audited unit *before* issuing — the unit confirms
  the factual accuracy of the exceptions (not the conclusion). This prevents
  disputes over facts from masquerading as disputes over judgment.
- Obtain the **management response** (§12): agreement/disagreement, remediation
  action, owner, and target date.
- Genuine disagreements are recorded, not suppressed; unresolved disagreement is
  escalated per the operating model (§22).

### 6.6 Phase 6 — Reporting

- Issue the audit report (§13) to the defined recipients.
- The report is an **advisory finding until formally issued**; it becomes a
  recorded artifact when the audit is formally commissioned and issuance is
  explicitly requested (read-only contract).

### 6.7 Phase 7 — Follow-up and closure

- Track each agreed remediation to completion (§12.5).
- Perform **independent follow-up testing** — a finding is closed only when the
  auditor verifies the remediation actually works, not when management asserts it
  is done.
- Report residual/overdue findings upward until closed.

---

## 7. Audit criteria — what "conformance" means

An audit is only as sound as the criterion it tests against. The criterion must be
**fixed, documented, and pre-agreed** — never invented during the audit.

### 7.1 Sources of criteria (in precedence order)

1. **Policies** (`policies/*`) — binding organizational rules; the highest
   authority for conformance.
2. **The governance references** (`references/00`–`14`) — the documented design of
   each control.
3. **The workflows** (`workflows/*`) — the step-by-step expected operation.
4. **The checklists** (`checklists/*`) — the pass/fail gates.
5. **The templates** (`templates/*`) — the required shape of artifacts.

Where these conflict, the higher-precedence source governs, and the conflict
itself is a finding against the second line (they own consistency of the design).

### 7.2 Criteria must be testable

A criterion is auditable only if conformance to it can be judged from inspectable
evidence. "Architecture should be well-governed" is not a criterion. "Every change
to a frozen baseline has an approved ACR whose approver matches the authority
matrix" is. Part of the auditor's planning job (§6.1) is to translate design
statements into **testable assertions** — and to flag any control whose design is
not testable as a design-adequacy finding.

### 7.3 The criterion is frozen for the audit period

The criterion used is the one in force *during the period audited*, not the
current one. If the control's design changed mid-period, the audit tests each
sub-period against the criterion then in force. This is why references are
versioned (`references/16` §11.2) — historical conformance must remain judgeable.

---

## 8. Evidence: sufficiency, reliability, and the audit trail

### 8.1 The two properties of audit evidence

- **Sufficiency** — is there *enough* of it? Driven by sample size (§9) and the
  materiality threshold. One conforming instance does not evidence a reliably
  operating control.
- **Reliability** — is it *trustworthy*? Driven by its source and nature.

### 8.2 The reliability hierarchy

From most to least reliable:

1. **Auditor-generated** — the auditor re-performs the control and observes the
   result directly (§10.2). Most reliable.
2. **Independent third-party** — evidence from a source outside the audited unit.
3. **System-generated, tamper-evident** — records from a controlled system with an
   immutable trail (§16).
4. **Internally-generated documentary** — the unit's own records (ADRs, register
   entries). Reliable *only to the degree the trail is tamper-evident*.
5. **Verbal / assertion** — interviews. **Never sufficient on its own** for a
   conformance conclusion; used to locate and contextualize documentary evidence.

> The reliability hierarchy is why an unauditable trail collapses assurance: if
> the internally-generated records are not tamper-evident (§16), they drop toward
> the bottom of the hierarchy, and the auditor must fall back on costly
> re-performance for everything.

### 8.3 Corroboration

Higher-risk conclusions require **corroboration** — agreement between independent
evidence sources. A register entry (level 4) is corroborated by tracing it to the
real decision moment (a meeting minute, level 3) *and* re-performing the authority
check against the matrix (auditor-generated, level 1). Corroboration across the
hierarchy is what defeats the "Potemkin register" anti-pattern (`references/16`
§12.2).

---

## 9. Sampling methodology

Audits rarely test 100% of a population; they sample. The sampling method
determines what the audit can validly conclude.

### 9.1 Statistical vs. judgmental sampling

- **Statistical (random) sampling** supports quantified conclusions about the
  whole population ("with 95% confidence, the control fails ≤ X% of the time").
  Use for operating-effectiveness audits over large, homogeneous populations.
- **Judgmental (targeted) sampling** deliberately selects high-risk items (the
  largest changes, the oldest exceptions, the cross-domain decisions). Use to
  find problems, not to quantify a rate. It cannot support a population-wide
  statistical claim.

Most governance audits blend both: a random sample for the rate, plus a
judgmental overlay on the riskiest items.

### 9.2 Sample size drivers

Sample size rises with: population size, required confidence, expected deviation
rate, and control criticality; it falls with strong compensating controls. S1-
critical controls warrant larger samples and lower tolerable-deviation thresholds.

### 9.3 Coverage requirements

- **Across time** — for operating-effectiveness, the sample must span the whole
  period (not just the convenient recent weeks), because controls decay and spike.
- **Across units** — for org-wide conformance, sample across domains including at
  least one flagship, one peripheral, and one newly-formed unit (mirroring
  `references/16` §8.4).
- **Across the risk spectrum** — include both routine and edge-case instances;
  controls most often fail at the edges (emergency changes, cross-domain, the
  end-of-quarter rush).

### 9.4 Sampling integrity

The sampling method, population definition, and selected items are recorded in the
working papers *before* results are known, so the sample cannot be quietly
reshaped to flatter (or damn) the result. Reproducibility is a requirement.

---

## 10. Testing techniques

### 10.1 Walkthrough

Trace a single instance from start to finish to confirm understanding of the
control's design and evidence trail (§6.2). A walkthrough confirms *how the
control works*; it is not a test of *how reliably* it works (that needs a sample).

### 10.2 Re-performance

The auditor independently re-executes the control's decision logic on real inputs
and compares to the recorded outcome. *E.g., take a real change, apply the
authority matrix independently, and check the recorded approver matches.* Highest-
reliability technique (§8.2) because the evidence is auditor-generated.

### 10.3 Tracing and vouching

- **Tracing (completeness):** start from a source event and follow it *forward* to
  its record. *E.g., start from real architectural decisions (meeting minutes) and
  confirm each has an ADR.* Detects **missing** records — the register's sins of
  omission.
- **Vouching (existence/validity):** start from a record and follow it *backward*
  to its supporting event. *E.g., start from register entries and confirm each
  reflects a real decision.* Detects **fabricated or unsupported** records.

Both directions are needed: tracing catches under-recording, vouching catches
over-recording. Auditing in only one direction leaves half the failure modes
untested.

### 10.4 Reconciliation

Compare two independent representations that should agree — the register vs. the
ADR store, the ownership model vs. the actual component inventory, the exception
register vs. the live deviations. Unreconciled differences are findings.

### 10.5 Inspection and observation

- **Inspection:** examine artifacts for required attributes (an ADR has options,
  rationale, decision, authority).
- **Observation:** watch a control being performed live (attend a board meeting to
  observe whether decisions are actually deliberated or rubber-stamped — the
  detector for "board theatre," `references/16` §12.3).

---

## 11. Findings — classification, rating, and framing

### 11.1 Anatomy of a finding

Every finding is written with the classic five attributes, so it is actionable and
defensible:

1. **Criterion** — what *should* be (the documented control, §7).
2. **Condition** — what *is* (the observed reality, with evidence).
3. **Cause** — *why* the gap exists (root cause, §11.4).
4. **Consequence (effect/risk)** — what the gap could lead to (the "so what").
5. **Corrective action** — the recommended remediation (agreed with management,
   §12).

A "finding" missing the criterion or the consequence is not a finding — it is an
observation, and it will (rightly) be ignored.

### 11.2 Materiality

Not every deviation is a finding. A deviation is material — and therefore reported
as a finding — when it exceeds the **materiality threshold** set in planning
(§6.1): it could plausibly lead to a wrong governance outcome, a baseline breach,
a compliance failure, or an erosion of trust in the records. Immaterial deviations
are noted for trend analysis but do not carry a finding rating.

### 11.3 Finding severity ratings

Findings use the skill's canonical severity scale (`SKILL.md` §7,
`references/15`), applied to *assurance*:

| Rating | Meaning in an audit context | Typical response SLA |
| --- | --- | --- |
| **S1 — Critical** | A load-bearing control is not operating; a frozen baseline, a compliance control, or a cross-domain contract is unprotected; or records are untrustworthy. Assurance cannot be given. | Immediate escalation; remediation on the shortest cycle. |
| **S2 — Major** | A control operates unreliably or a significant class of instances bypasses it; contained within a domain. | Near-term remediation with an agreed plan. |
| **S3 — Minor** | The control operates but with recurring low-impact gaps or documentation weaknesses. | Scheduled remediation. |
| **S4 — Informational** | An improvement opportunity or an isolated slip with no pattern. | Optional; tracked as a trend. |

An audit that finds an S1 issues an **assurance qualification** — it states
explicitly that assurance *cannot* be provided over the audited control until
remediated. This is the audit equivalent of a no-go.

### 11.4 Root cause, not symptom

Durable remediation requires the *cause*, not the *instance*. A missing ADR is a
symptom; the cause might be that the ADR trigger criteria are unclear, that
authoring is nobody's explicit responsibility, or that the process is too heavy to
follow under delivery pressure. The auditor identifies the cause category
(design gap, awareness/training gap, capacity gap, tooling gap, culture/incentive
gap) so the second line remediates the *system*, not the single record.

### 11.5 Framing findings constructively

Findings target **controls, not people** (§1.3). "The ADR control does not detect
missing decisions" is a finding; "Team X is careless" is not. This is not
politeness for its own sake — findings framed as blame corrupt the evidence base,
because audited units then hide rather than surface issues (the "assessment as
blame" anti-pattern, `references/16` §12.7, applies identically to audit).

---

## 12. The management response and remediation lifecycle

### 12.1 Who owns remediation

The auditor **finds**; the **second line** (governance function) and the
**first line** (owners) **fix**. This separation (§3) is what preserves the
auditor's independence for the follow-up. The auditor owns *tracking* remediation
to closure, never *performing* it.

### 12.2 The management response

For each finding, the audited unit provides a formal response:

- **Agreement or disagreement** with the finding (facts already cleared in §6.5;
  this is agreement with the *conclusion and rating*).
- **Corrective action** — the specific change that addresses the *root cause*.
- **Action owner** — an accountable role (`references/04`, `references/13`), never
  "the team."
- **Target date** — realistic and commensurate with the severity SLA (§11.3).
- **Interim risk acceptance** — for S1/S2, a named authority explicitly accepts the
  residual risk until remediation lands, via the exception process
  (`references/08`). A finding cannot sit open with unaccepted critical risk.

### 12.3 Handling disagreement

Genuine, reasoned disagreement is legitimate and is **recorded**, not suppressed.
The finding stands with the disagreement noted; unresolved S1/S2 disagreements are
escalated through the operating model's dispute path
(`workflows/escalation-and-dispute-resolution.md`, `references/00`). The auditor
does not water down a finding to obtain agreement — that would trade assurance for
comfort.

### 12.4 Remediation states

```
Open → Response-Agreed → In-Remediation → Remediation-Asserted
     → Follow-up-Testing → (Closed | Reopened)
```

A finding that is overdue in any pre-closed state is **escalated** with increasing
seniority as it ages, mirroring exception aging (`references/08`).

### 12.5 Closure requires independent verification

> **A finding is closed only when the auditor independently verifies the
> remediation actually works** — not when management asserts completion.

"Remediation-Asserted" is a claim; "Closed" is verified. Follow-up testing
re-applies the relevant technique (§10) on a fresh sample from *after* the fix.
Premature closure on assertion is a top audit anti-pattern (§20.3) and quietly
reintroduces the original risk.

---

## 13. Audit reporting

### 13.1 Report contents

A governance audit report contains, at minimum:

1. **Objective, scope, and period** — precisely what was and was not audited.
2. **Criteria** — the documented standard tested against, with reference versions
   (§7.3).
3. **The opinion / conclusion** — the overall assurance conclusion (conforms /
   conforms with exceptions / does not conform / assurance qualified — §11.3).
4. **Findings** — each with the five attributes (§11.1), its severity, and its
   root cause.
5. **Management responses** — including any recorded disagreements (§12.3).
6. **Prior-finding status** — the state of remediation of earlier findings
   (follow-up, §12.5).
7. **Scope limitations** — anything the auditor could not test, and its effect on
   the conclusion. An undisclosed scope limitation is itself a serious defect.
8. **Provenance** — auditors, independence confirmation, dates, working-paper
   reference, and distribution list.

### 13.2 Tailoring by audience

- **To the audited unit / first line** — the full detail, for remediation.
- **To the second line (governance function)** — findings plus systemic themes
  across units.
- **To the ARB / risk committee** — the assurance conclusion, S1/S2 findings, and
  overdue-remediation exposure — *not* an operational data dump, and never a
  unit-vs-unit leaderboard used for blame.

### 13.3 Reporting integrity

- Report the **conclusion the evidence supports**, including uncomfortable ones —
  "tests failed, here is the evidence" is mandatory, never softened.
- Never issue an unqualified assurance where a scope limitation or an unremediated
  S1 exists.
- The report is issued to the *defined recipients per the program*, never to
  recipients suggested by the audited unit to route around an inconvenient finding.

---

## 14. Continuous auditing and control automation

### 14.1 From periodic to continuous

Point-in-time audits leave gaps between cycles. **Continuous auditing** shifts
suitable tests to run automatically and frequently against the governance data,
turning a periodic sample into ongoing monitoring.

Well-suited to continuous auditing:

- **Register completeness** — automated reconciliation of decisions to ADRs to
  register entries; flag orphans (`references/03`).
- **Exception aging and expiry** — automated detection of expired-but-active or
  many-times-renewed exceptions (`references/08`; defeats "permanent temporary").
- **Authority conformance** — automated check that each recorded approval's
  approver matches the authority matrix (`references/00`).
- **Ownership coverage** — automated orphan-component detection (`references/04`).
- **Baseline drift** — continuous comparison against the frozen baseline
  (`references/09`), consumed by the audit as substantive evidence.

### 14.2 Continuous auditing vs. the control itself

A subtle but vital line: automated *monitoring operated by the second line* is a
**control**, not an audit — it lacks independence. The same automation becomes
**continuous auditing** only when its design, operation, and outputs are
independently owned by the third line (§3). The audit may *rely on* second-line
monitoring, but must independently test that the monitoring itself works — you
cannot outsource assurance to the thing being assured.

### 14.3 Human judgment remains

Automation handles completeness and rule-conformance at scale; it cannot judge
*whether a decision was sound*, whether a board genuinely deliberated, or whether a
root cause is design or culture. Continuous auditing narrows the human auditor's
focus to judgment-heavy work — it does not replace it.

---

## 15. Auditing each governance function (control catalog overview)

Each governance function (`references/00`–`14`) exposes specific, testable
controls. The full catalog is in Appendix A; the overview:

| Function | Key control to audit | Primary technique | Assurance question |
| --- | --- | --- | --- |
| Operating model (`00`) | Board convenes with quorum; authority matrix honored | Observation + re-performance | Are decisions made by the right authority? |
| Lifecycle (`01`) | Stage gates enforced; no phase skipped silently | Tracing | Did work pass its gates? |
| ADR (`02`) | Every ASD has a lifecycle-correct ADR | Tracing + vouching | Are decisions recorded and current? |
| Register (`03`) | Complete, traceable, audited | Reconciliation + tracing/vouching | Is the register trustworthy? |
| Ownership (`04`) | Every element owned; no orphans | Reconciliation | Is everything accountable to someone? |
| Change (`05`) | All baseline changes via approved ACR | Tracing + re-performance | Are baselines changed only with authority? |
| Evolution (`06`) | Roadmap and fitness functions operated | Inspection | Is evolution deliberate? |
| Tech debt (`07`) | Debt ledgered, accepted, scheduled | Inspection + reconciliation | Is debt visible and managed? |
| Exceptions (`08`) | Time-boxed, independently approved, not perpetual | Re-performance + aging analysis | Are deviations controlled and temporary? |
| Drift (`09`) | Systematic detection, classification, closure | Substantive re-performance | Does reality match the baseline? |
| Cross-domain (`10`) | Dependencies registered, contracts governed | Reconciliation + tracing | Are the seams governed? |
| Release gate (`11`) | Evidence-based approval with correct authority | Re-performance | Did releases pass a real gate? |
| Sprint gate (`12`) | Gate operated, not skipped under pressure | Tracing | Are sprints architecturally gated? |
| Metrics (`14`) | KPIs accurate and not gamed | Re-performance of the metric calc | Can we trust the governance numbers? |

> Note the recursive control at the bottom: the audit tests whether the *metrics
> themselves* are honest, because every Level-4 maturity claim and every KPI-driven
> decision rests on them (`references/16` §12.4 — instrumentation without
> foundation).

---

## 16. The immutable audit trail — requirements

Assurance is only possible over records that cannot be silently altered. The audit
trail is therefore a first-class governance requirement, not an implementation
detail.

### 16.1 Properties required of the governance record

- **Append-only / tamper-evident** — changes to ADRs, register entries, approval
  records, and exception records must be recorded as new, attributed events, not
  silent overwrites. History must be reconstructable.
- **Attributed** — every governance event carries *who, what, when, and under what
  authority*. An event without an actor is unauditable.
- **Time-ordered and immutable in sequence** — the order of events cannot be
  rewritten; a decision cannot be back-dated without evidence of the back-dating.
- **Complete** — the trail captures the *whole* lifecycle (proposed → accepted →
  superseded), not just the final state. The final state alone hides how it was
  reached.
- **Retained** — records are kept for a defined retention period matched to the
  risk tier and any regulatory obligation, and are recoverable throughout.

### 16.2 The audit's own trail is separate

The auditor writes findings and working papers into an **audit trail that is
distinct from the governance artifacts** being audited (§2.3). Mixing them would
let the audited records be changed by the auditor, destroying independence. The
audit trail is itself append-only and attributed.

### 16.3 Why this matters (the collapse condition)

If the governance trail is *not* tamper-evident, internally-generated records drop
to the bottom of the reliability hierarchy (§8.2), and the auditor must fall back
on re-performance and third-party corroboration for *everything* — which is often
infeasible at scale. In that state, **assurance effectively cannot be given**, and
the correct audit conclusion is a scope limitation: *"the trustworthiness of the
records could not be established."* This is why baseline-freeze integrity and an
immutable trail are prerequisites for the whole governance edifice.

---

## 17. Auditor conduct, ethics, and conflicts

- **Objectivity** — form conclusions from evidence, not relationships, pressure, or
  desired outcomes.
- **Integrity** — report what the evidence shows, including findings that
  embarrass powerful stakeholders; never soften a finding to obtain agreement
  (§12.3).
- **Confidentiality** — audit evidence often contains sensitive architectural and
  security detail; it is handled on need-to-know and never used for any purpose
  beyond the audit.
- **Competence** — audit only what one is competent to judge; where architectural
  depth exceeds the auditor's, engage a subject-matter expert while retaining
  independent judgment.
- **Conflict disclosure** — any relationship, prior role, or interest that could
  impair independence (§2) is disclosed *before* the audit and, if material,
  disqualifies the auditor from that engagement.
- **Due professional care** — proportion the depth of work to the risk; document
  enough that the conclusion is defensible; neither rubber-stamp nor over-audit.

---

## 18. Quality assurance of the audit function itself

*Quis custodiet ipsos custodes?* The audit function is not exempt from assurance.

- **Working-paper review** — a second, senior auditor reviews the working papers of
  each significant audit to confirm the conclusion follows from the evidence.
- **Independence attestation** — each audit records a confirmation that the
  independence rule (§2) held.
- **Periodic external review** — the audit function is itself periodically reviewed
  by an independent external party for conformance to its own standards.
- **Findings on the audit function** — defects in the audit process (missed scope,
  premature closure, independence lapses) are findings against the third line,
  reported to the ARB/risk committee, and remediated like any other.

---

## 19. Relationship to external/regulatory audit

- **Internal governance audit is a control that external auditors rely on.** A
  strong, independent internal audit reduces the burden and risk of external and
  regulatory audits — external auditors test the internal audit's work and lean on
  it where it is sound.
- **Criteria may differ.** External audits test against *regulatory* criteria;
  internal governance audit tests against the *organization's own* controls. Where
  a regulation imposes a control, it becomes part of the internal criteria (§7.1)
  and is audited internally too — a governance failure that is also a compliance
  breach is always at least S1.
- **Evidence reuse.** The immutable audit trail (§16) and continuous-auditing
  outputs (§14) are precisely the evidence external auditors request; designing the
  trail for internal audit makes external audit cheaper and less disruptive.
- **No substitution.** External audit does not replace internal governance audit,
  and vice versa. They provide different assurance to different parties.

---

## 20. Anti-patterns in governance auditing

### 20.1 The comfort audit

An audit scoped, sampled, and timed to *confirm* that all is well rather than to
*find* whether it is. Detected by: convenient sampling (only recent, only
flagship), no adverse findings ever, and criteria loosened until practice
conforms. A comfort audit is worse than no audit — it manufactures false assurance.

### 20.2 Criteria drift

Judging conformance against a moving or invented standard, so "conformance" means
whatever the audited unit happened to do. Countered by fixing and versioning the
criteria before testing (§7.3).

### 20.3 Closure on assertion

Marking findings closed because management said the fix was done, without
independent follow-up testing (§12.5). Quietly reintroduces every "remediated"
risk.

### 20.4 Independence erosion

The auditor who last year *designed* the control now audits it; or the audit
function reports through the owner of the audited process. Each destroys the value
of the assurance while preserving its appearance (§2).

### 20.5 The data dump

A report that lists every immaterial deviation without severity, root cause, or a
clear conclusion — burying the S1 finding in noise so nothing is actioned (§11.2,
§13.2).

### 20.6 Blame-driven audit

Using findings to punish teams, which corrupts the evidence base as units learn to
hide rather than surface issues (§11.5). The most self-defeating anti-pattern,
because it destroys the very transparency audit depends on.

### 20.7 Auditing the paperwork, not the outcome

Confirming that artifacts *exist* (a populated register, a signed approval) without
tracing to whether the underlying *reality* is correct (vouching, §10.3;
substantive testing, §4.1). Passes the Potemkin register (`references/16` §12.2).

---

## 21. Worked example — an ADR/register conformance audit

> *Illustrative. Fictional unit "Payments Domain," Tier 1. Audit type:
> conformance + completeness, operating effectiveness over the last 6 months.*

**Objective.** Provide assurance that (a) every architecturally significant
decision in Payments in the period has a lifecycle-correct ADR, and (b) the
Decision Register is complete and traceable for those decisions.

**Criteria.** `references/02` (ADR lifecycle) and `references/03` (register
governance), versions in force during the period; `policies/` where applicable.

**Independence check.** Auditor is from a *different* domain and has never held an
approving role over Payments ADRs. Independence attested (§18).

**Population & sample.**
- Tracing population: all recorded architectural decision moments in the period
  (board minutes, design-review notes) → 41 decision moments.
- Vouching population: all register entries created in the period → 38 entries.
- Judgmental overlay: all 6 cross-domain decisions (highest blast radius) tested
  fully.
- Random statistical sample across time for the remainder.

**Testing and results.**
1. **Tracing (completeness).** Of 41 decision moments, **37 had ADRs; 4 did not** —
   all 4 were emergency changes made under delivery pressure near quarter-end.
   *Exception: systemic, clustered at the edge (emergency + quarter-end).*
2. **Vouching (existence).** Of 38 register entries, 38 traced to real decisions —
   no fabricated entries. ✅
3. **Reconciliation.** Register vs. ADR store: **2 ADRs existed but were missing
   from the register** (recording gap, not decision gap).
4. **Re-performance (authority).** For the 6 cross-domain ADRs, the recorded
   approver matched the authority matrix in 5 cases; **1 was approved by the
   Domain Owner alone though it was cross-domain and required ARB** (authority
   breach).

**Findings.**

- **F1 (S1 — Critical).** *Criterion:* all baseline-affecting decisions require an
  ADR (`references/02`). *Condition:* 4 of 41 decisions (all emergency, quarter-
  end) had no ADR. *Cause:* the emergency-change path has no enforced retro-ADR
  step; authoring is nobody's explicit responsibility under time pressure
  (design + capacity gap). *Consequence:* the recorded architecture is
  incomplete; baseline changes are unrecorded and thus undetectable by drift
  checks — assurance over baseline integrity cannot be given. *Action (agreed):*
  add a mandatory 48-hour retro-ADR step to the emergency-change workflow with a
  named owner; continuous-auditing reconciliation to flag emergency changes
  lacking an ADR. Owner: Domain Architecture Owner. Target: next cycle.
- **F2 (S1 — Critical).** *Criterion:* cross-domain ADRs require ARB approval
  (`references/00` authority matrix). *Condition:* 1 of 6 cross-domain decisions
  approved by the Domain Owner alone. *Consequence:* a cross-domain change was made
  without cross-domain authority — precisely the blast-radius risk the matrix
  exists to contain. *Action (agreed):* the decision is re-adjudicated by the ARB;
  authority-conformance check automated (§14). Interim risk formally accepted via
  exception (`references/08`) pending re-adjudication.
- **F3 (S3 — Minor).** *Condition:* 2 ADRs missing from the register (recording
  lag). *Cause:* manual, unreconciled register updates (tooling gap). *Action:*
  automated ADR→register reconciliation.

**Conclusion.** **Assurance qualified.** The register's *existence and validity*
are sound (no fabrication), but its *completeness* is not — two S1 findings mean
assurance over baseline integrity cannot be given until F1 and F2 are remediated
and independently verified. Note the parallel with the maturity assessment of the
same domain (`references/16` §16): the audit's completeness finding is the
concrete, evidenced form of that assessment's C10/C9 weakness.

**Follow-up.** F1/F2 tracked to independent verification (§12.5); closure requires
a fresh post-fix sample showing emergency changes now carry ADRs and cross-domain
approvals now match the matrix.

---

## 22. Integration with the operating model

- **Who commissions audits.** The ARB or risk committee (`references/00`) approves
  the annual program (§5.4) and commissions risk-/event-triggered audits.
- **Who the audit reports to.** A path independent of the audited control's owner
  (§2.2, §3) — typically the ARB/risk committee, never the second line alone for
  audits of the second line's own controls.
- **How disputes resolve.** Unresolved finding disagreements escalate via
  `workflows/escalation-and-dispute-resolution.md`.
- **How audit feeds the rest of the skill.** Findings feed remediation (second
  line), inform the next maturity assessment (`references/16`), and can trigger
  architecture change (`references/05`) or evolution (`references/06`) where the
  root cause is a design gap. Systemic findings across units are an input to the
  operating model's own redesign.
- **Read-only discipline throughout.** The audit changes nothing it audits; it
  writes only into its own separate, immutable audit trail (§16.2), and issues a
  recorded report only when formally commissioned and issuance is explicitly
  requested. It never produces code — where remediation needs code, the auditor
  states the required control change and hands it to the delivery line.

---

## 23. Appendix A — control catalog (full)

> For each governance function: the control, the assertion tested, the technique,
> and the primary evidence. Severity shown is the *default* rating if the control
> is found not operating.

**Operating model (`references/00`) — S1**
- *Control:* the architecture board convenes at the defined cadence with quorum.
  *Assertion:* quorate meetings occurred throughout the period. *Technique:*
  inspection of minutes + observation. *Evidence:* dated minutes with attendance.
- *Control:* decisions are approved by the authority named in the matrix.
  *Assertion:* recorded approvers match the matrix for their scope. *Technique:*
  re-performance. *Evidence:* approval records + matrix.
- *Control:* escalations follow defined triggers. *Assertion:* escalated items met
  a defined trigger; qualifying items were escalated. *Technique:* tracing both
  directions. *Evidence:* escalation records.

**Lifecycle & gates (`references/01`) — S2**
- *Control:* work passes defined entry/exit gates before proceeding. *Assertion:*
  no qualifying work skipped a gate. *Technique:* tracing. *Evidence:* gate
  records.

**ADR (`references/02`) — S1**
- *Control:* every architecturally significant decision has an ADR. *Technique:*
  tracing (decisions → ADRs). *Evidence:* decision minutes + ADR store.
- *Control:* ADR lifecycle states and supersession chains are honored.
  *Technique:* inspection. *Evidence:* ADR history.
- *Control:* no register/ADR entry is fabricated. *Technique:* vouching. *Evidence:*
  ADR → real decision.

**Register (`references/03`) — S1**
- *Control:* the register is the single authoritative source and is complete.
  *Technique:* reconciliation + tracing. *Evidence:* register vs. ADR store.
- *Control:* every entry traces to an ADR and an owner. *Technique:* re-performance
  of traceability. *Evidence:* register schema fields.
- *Control:* the register is periodically audited and integrity-checked.
  *Technique:* inspection of prior audits. *Evidence:* audit history.

**Ownership (`references/04`) — S1**
- *Control:* every architectural element maps to an accountable owner. *Technique:*
  reconciliation (ownership model vs. component inventory). *Evidence:* orphan
  report.
- *Control:* orphaned elements are detected and assigned within SLA. *Technique:*
  inspection of orphan-resolution records.

**Change (`references/05`) — S1**
- *Control:* every change to a frozen baseline has an approved ACR. *Technique:*
  tracing (baseline diffs → ACRs) + vouching. *Evidence:* baseline history + ACRs.
- *Control:* ACR approver matches authority. *Technique:* re-performance.
- *Control:* emergency-change rate is within tolerance and each has retro-approval.
  *Technique:* analysis + tracing. *Evidence:* emergency-change log.

**Evolution (`references/06`) — S2**
- *Control:* roadmaps and fitness functions are operated. *Technique:* inspection.
  *Evidence:* roadmap + fitness-function results.

**Technical debt (`references/07`) — S2**
- *Control:* debt is ledgered, accepted by authority, and scheduled. *Technique:*
  inspection + reconciliation (ledger vs. known debt). *Evidence:* debt ledger.

**Exceptions (`references/08`) — S1**
- *Control:* every deviation is recorded, time-boxed, and independently approved.
  *Technique:* re-performance + tracing (live deviations → exceptions).
- *Control:* no exception is perpetually renewed past its intent. *Technique:*
  aging/renewal analysis. *Evidence:* exception register with expiry + renewal
  counts.

**Drift (`references/09`) — S1**
- *Control:* the running system is systematically compared to the baseline.
  *Technique:* substantive re-performance. *Evidence:* drift findings + baseline.
- *Control:* drift findings are classified and closed (remediate/waive/promote).
  *Technique:* tracing to closure. *Evidence:* drift register.

**Cross-domain (`references/10`) — S2**
- *Control:* cross-domain dependencies are registered with governed contracts.
  *Technique:* reconciliation + tracing. *Evidence:* dependency register.
- *Control:* blast radius is analyzed before dependency changes. *Technique:*
  inspection.

**Release gate (`references/11`) — S1**
- *Control:* every release has an evidence-based architecture approval by the
  correct authority. *Technique:* re-performance + tracing (releases → approval
  records). *Evidence:* approval records + release log.

**Sprint gate (`references/12`) — S1**
- *Control:* sprints pass an architecture gate; the gate is not skipped under
  pressure. *Technique:* tracing. *Evidence:* sprint approval records.

**Metrics (`references/14`) — S1 (recursive)**
- *Control:* governance KPIs are calculated correctly and not gamed. *Technique:*
  re-performance of the metric calculation from raw data. *Evidence:* raw data +
  reported metric.

---

## 24. Appendix B — audit working-paper template

```
AUDIT: ____________________________  REF: ____________  PERIOD: ______________
CONTROL TESTED: ___________________  FUNCTION (ref): __________  SEVERITY: ___
CRITERION (source + version): ______________________________________________
AUDIT TYPE: [conformance | design | operating-effectiveness | substantive]
INDEPENDENCE CONFIRMED: [Y/N]  AUDITOR: __________  REVIEWER: ______________

POPULATION DEFINITION: _____________________________________________________
POPULATION SIZE: ______   SAMPLING METHOD: [statistical | judgmental | blend]
SAMPLE SIZE: ______   SELECTION BASIS: _____________________________________
(Sample fixed BEFORE results — list item IDs) : ____________________________

TEST PERFORMED (technique §10): ____________________________________________
RESULT — conforming: ______  exceptions: ______  exception rate: ______
EXCEPTION DETAIL (ID → nature of deviation): _______________________________
MATERIALITY THRESHOLD: ______   MATERIAL? [Y/N]
ISOLATED OR SYSTEMIC: ______   ROOT-CAUSE CATEGORY: ________________________

CONCLUSION FOR THIS CONTROL: [conforms | conforms w/ exceptions | does not
conform | unable to conclude — scope limitation]
CROSS-REF TO FINDING(S): ___________________________________________________
EVIDENCE POINTERS (reliability level §8.2): ________________________________
```

---

## 25. Appendix C — finding write-up template

```
FINDING ID: ____________   RATING: [S1 | S2 | S3 | S4]   STATUS: Open
AUDIT REF: ____________   CONTROL / FUNCTION: ______________________________

CRITERION (what should be):      _____________________________________________
CONDITION (what is + evidence):  _____________________________________________
CAUSE (root, category):          _____________________________________________
CONSEQUENCE (risk / "so what"):  _____________________________________________
CORRECTIVE ACTION (recommended): _____________________________________________

MANAGEMENT RESPONSE: [agree | disagree]   OWNER (role): ______________________
AGREED ACTION: _____________________________________________________________
TARGET DATE: ____________   INTERIM RISK ACCEPTANCE (authority + exception ref
for S1/S2): ________________________________________________________________
DISAGREEMENT (if any, recorded verbatim): __________________________________

REMEDIATION STATE: Open → Response-Agreed → In-Remediation →
Remediation-Asserted → Follow-up-Testing → [Closed | Reopened]
FOLLOW-UP TEST (technique, fresh sample, result): __________________________
CLOSURE VERIFIED BY (auditor + date): ______________________________________
```

---

## 26. Appendix D — glossary deltas

Terms introduced by this reference (add to
`references/15-glossary-and-taxonomy.md`):

- **Governance audit** — independent, objective assurance that governance controls
  are adequately designed and operating effectively, evidenced and read-only.
- **Assurance** — the confidence, backed by independent evidence, that a control
  is working; the audit's product.
- **Three lines of defense** — first line operates controls, second line oversees
  them, third line (audit) independently verifies them (§3).
- **Independence (of mind / in appearance)** — the auditor's objectivity in
  substance and in structural position (§2).
- **Audit universe** — the complete inventory of auditable governance controls
  across units (§5.1).
- **Materiality threshold** — the size of deviation above which a finding is raised
  (§11.2).
- **Tracing vs. vouching** — testing completeness (event → record) vs. existence
  (record → event) (§10.3).
- **Re-performance** — the auditor independently re-executing a control to verify
  its recorded outcome (§10.2).
- **Assurance qualification** — an explicit statement that assurance cannot be
  given over a control, issued on an S1 or a scope limitation (§11.3, §16.3).
- **Finding (five attributes)** — criterion, condition, cause, consequence,
  corrective action (§11.1).
- **Remediation lifecycle** — the states a finding passes through to verified
  closure (§12.4).
- **Closure on assertion** — the anti-pattern of closing a finding on management's
  claim without independent verification (§12.5, §20.3).
- **Continuous auditing** — independently-owned automated testing of governance
  controls between periodic audits (§14).
- **Immutable audit trail** — the append-only, attributed, complete, retained
  record that makes governance auditable (§16).
- **Comfort audit** — an audit designed to confirm rather than to find; a
  manufacturer of false assurance (§20.1).

---

*Governance Audit — the third-line assurance layer. It independently verifies that
governance is real, that its records can be trusted, and that its gaps are found,
reported, and remediated to verified closure. It observes and reports; it changes
nothing it audits; and it never produces code.*
