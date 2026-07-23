# Architecture Governance — Maturity Model

> **Scope.** This reference defines how a large enterprise **measures, scores,
> benchmarks, and deliberately advances** the maturity of its Architecture
> Governance function. It is the yardstick the Architecture Governance skill uses
> to answer: *"How good is our governance, where are the gaps, and what is the
> next credible step?"*
>
> **Read-only contract.** This document supports **assessment and roadmapping**.
> A maturity assessment is an *advisory finding*; it becomes a recorded artifact
> only when the user explicitly asks for the assessment to be written. This
> document never triggers production code. See `SKILL.md` §2.
>
> **Relationship to the rest of the skill.** The maturity model is the
> *meta-governance* layer: it grades how well every other governance function
> (`references/00`–`references/14`) is actually performed. It consumes the metrics
> defined in `references/14-metrics-kpis-and-reporting.md`, is governed by the
> bodies in `references/00-governance-operating-model.md`, and uses the
> vocabulary of `references/15-glossary-and-taxonomy.md`.

---

## Table of contents

1. Purpose and philosophy
2. Why maturity models fail — and the design principles this one uses to not
3. The maturity scale (Levels 0–5)
4. The assessment dimensions (the 12 governance capabilities)
5. The capability × level rubric (the core of the model)
6. Evidence model — what counts as proof at each level
7. Scoring methodology
8. The assessment process (end-to-end)
9. Roles in a maturity assessment
10. Cadence, triggers, and scope of assessments
11. Benchmarking and calibration
12. Anti-patterns and maturity theatre
13. The maturity improvement roadmap
14. Target operating maturity and the "good enough" question
15. Reporting a maturity assessment
16. Worked example — a full assessment
17. Integration with the governance operating model
18. Appendix A — capability rubric summary tables
19. Appendix B — assessment questionnaire bank
20. Appendix C — maturity scoring worksheet
21. Appendix D — glossary deltas

---

## 1. Purpose and philosophy

### 1.1 What this model is for

Architecture governance is not a binary — an organization does not simply "have
governance" or "lack governance." It performs each governance function somewhere
on a spectrum from *ad hoc heroics* to *optimizing, data-driven discipline*. The
purpose of the maturity model is to make that spectrum:

- **Explicit** — every capability has named levels with observable criteria, so
  two independent assessors reach the same score from the same evidence.
- **Diagnostic** — it locates *which* capabilities are weak, not merely that
  governance "feels immature."
- **Actionable** — every current-state score maps to a concrete next step, so an
  assessment ends in a roadmap, not a grade.
- **Comparable** — scores are stable over time and across domains, enabling trend
  lines and portfolio-level views.

### 1.2 What this model is NOT for

- It is **not a performance review** of individuals. Maturity measures the
  *system of governance*, not the diligence of any one architect. Scoring people
  against it is the fastest way to make the data dishonest.
- It is **not a compliance checklist.** A high maturity score does not certify
  regulatory compliance; compliance is a specific control set assessed elsewhere.
  Maturity measures the *reliability of the governance process*, which is a
  necessary but not sufficient condition for compliance.
- It is **not a goal in itself.** Level 5 everywhere is almost always the wrong
  target. See §14 on target operating maturity — governance maturity must be
  *proportionate* to the risk and scale of what is being governed.

### 1.3 The governing philosophy

> **Maturity is the degree to which governance outcomes are produced
> *predictably, repeatably, and with evidence* — independent of who happens to be
> in the room.**

A mature governance function produces the same quality of decision whether the
Chief Architect is present or on leave, whether the team is seasoned or newly
formed, and whether the system is the flagship platform or a peripheral service.
Immaturity is the dependence of good outcomes on individual heroics, tribal
memory, and luck.

---

## 2. Why maturity models fail — and how this one is designed not to

Most enterprise maturity models rot into shelf-ware. The failure modes are
well-understood, and this model is designed against each of them.

| Failure mode | How it manifests | Design countermeasure in this model |
| --- | --- | --- |
| **Grade-chasing** | Teams optimize the score, not the outcome. "We need to be Level 4 by Q3." | Scores are *never* individual or team targets. Only the *portfolio trend* and *risk-weighted gaps* are reported upward (§15). |
| **Evidence-free scoring** | Assessors score on vibes and self-report. | Every level requires **named, inspectable evidence** (§6). No evidence, no level. Self-assessment is explicitly discounted (§7.4). |
| **Uniform target** | "Everything must be Level 5." | Target maturity is **risk-tiered** per domain (§14). Over-maturity is flagged as waste. |
| **One-shot assessment** | Assessed once, never revisited; instantly stale. | Assessment is **cadenced and event-triggered** (§10), with a defined shelf life. |
| **Model drift** | The rubric is reinterpreted differently each cycle. | The rubric is **versioned and calibrated** (§11); assessors are calibrated against reference cases. |
| **Dimension sprawl** | So many sub-criteria that scoring collapses. | Exactly **12 capabilities** (§4), each with a single 0–5 scale. Deliberately bounded. |
| **Averaging away signal** | A single overall number hides a critical gap. | The overall score is **gated by the minimum on any S1-critical capability** (§7.3), not a simple mean. |

---

## 3. The maturity scale (Levels 0–5)

The model uses a six-point scale. Levels 1–5 mirror the familiar staged-maturity
convention (initial → optimizing); **Level 0 is added deliberately** to name the
common enterprise reality of *governance that is asserted but not actually
performed.*

### 3.0 Level 0 — Absent / Nominal

Governance exists on paper (an org chart, a policy PDF) but is **not performed in
practice**. Decisions happen without records; the "board" has not met; the policy
is unread. The distinguishing test: *if the named governance body vanished
tomorrow, nothing about how work is done would change.*

- **Predictability:** none. Outcomes are entirely dependent on who acts.
- **Evidence:** the absence of evidence *is* the evidence — no decision records,
  no meeting minutes, no register entries.
- **Typical trigger to move up:** a governance failure with visible cost (a
  release breaks a cross-domain contract nobody owned).

### 3.1 Level 1 — Initial / Ad hoc

Governance happens, but **reactively and heroically.** When a problem is severe
enough, the right people are pulled together and a decision is made. There is no
defined process; the same class of problem is solved differently each time.

- **Predictability:** low. Good outcomes correlate with the presence of specific
  senior individuals.
- **Evidence:** decisions exist but are scattered (chat threads, email, a slide),
  not in a register.
- **Distinguishing test:** *the process cannot be described the same way twice by
  two participants.*

### 3.2 Level 2 — Repeatable / Managed

A **defined process exists for the most important governance functions** and is
followed on major decisions. Records are kept in a known place. The process is
*local* — each domain or team may run it slightly differently — but within a
team it is repeatable.

- **Predictability:** moderate for major decisions; low for minor ones.
- **Evidence:** a register exists and is populated for major items; templates are
  used inconsistently.
- **Distinguishing test:** *a new team member can find the process and the
  records without asking a specific person.*

### 3.3 Level 3 — Defined / Standardized

Governance is **standardized across the organization.** One process, one set of
templates, one register schema, one authority model. The process is documented,
trained, and applied to *all* qualifying decisions, not just the visible ones.
Roles and authorities are explicit and consistently honored.

- **Predictability:** high for in-scope decisions; the process is
  person-independent.
- **Evidence:** a single organization-wide register, consistent artifacts,
  documented authority matrix, evidence of training.
- **Distinguishing test:** *two different domains, assessed independently,
  describe and run the same governance process.*

### 3.4 Level 4 — Measured / Quantitatively Managed

The governance process is **instrumented and measured.** The organization knows
its governance KPIs (decision lead time, drift rate, exception aging, ADR
coverage) and manages the process *by the numbers*. Thresholds trigger action;
trends are watched; the process is controlled, not merely followed.

- **Predictability:** high, *and quantified* — the organization can state its
  governance performance with data and confidence intervals.
- **Evidence:** live dashboards (per `references/14`), tracked KPIs against
  targets, control charts, evidence that metric breaches triggered interventions.
- **Distinguishing test:** *the organization can answer "how well is governance
  performing?" with numbers, not adjectives.*

### 3.5 Level 5 — Optimizing / Continuously Improving

The governance process **improves itself** on the basis of its own data. Root
causes of governance failures are analyzed and designed out. The process adapts
deliberately to changing risk, scale, and technology. Innovation in governance
(new fitness functions, better drift detection) is piloted, measured, and rolled
out.

- **Predictability:** high and *rising* — the failure rate trends down over time
  by design, not by luck.
- **Evidence:** a closed improvement loop — retrospectives on governance itself,
  changes to the process traced to data, measured before/after impact.
- **Distinguishing test:** *the governance process this year is measurably better
  than last year, and the improvement is traceable to a deliberate, data-driven
  change.*

### 3.6 The scale at a glance

| Level | Name | One-line signature | Dependence on individuals |
| --- | --- | --- | --- |
| 0 | Absent / Nominal | On paper only; not performed | Total |
| 1 | Initial / Ad hoc | Heroic, reactive, undocumented | Very high |
| 2 | Repeatable / Managed | Defined locally for major items | High |
| 3 | Defined / Standardized | One process org-wide, all items | Low |
| 4 | Measured / Quantitatively Managed | Instrumented and managed by data | Low |
| 5 | Optimizing | Self-improving from its own data | Minimal |

> **Level integrity rule.** A capability is at Level *N* only if it *also*
> satisfies every level below *N*. Maturity is cumulative. An organization with
> beautiful dashboards (a Level-4 signal) but no standardized process (a Level-3
> requirement) is **not** Level 4 — it is Level 2 with instrumentation, which is
> a recognized and dangerous anti-pattern (§12.4).

---

## 4. The assessment dimensions — the 12 governance capabilities

Maturity is assessed across exactly **twelve capabilities.** Each maps to a
governance function elsewhere in this skill, so a maturity gap points directly at
the reference that fixes it. Each is scored independently on the 0–5 scale.

| # | Capability | What it measures | Primary reference | Criticality |
| --- | --- | --- | --- | --- |
| C1 | **Operating model & authority** | Are the bodies, cadence, quorum, and decision authority real and honored? | `00-governance-operating-model.md` | S1 |
| C2 | **Lifecycle & stage gates** | Are architecture lifecycle phases and gates defined and enforced? | `01-architecture-lifecycle.md` | S2 |
| C3 | **ADR discipline** | Are decisions captured as ADRs, with lifecycle states honored? | `02-adr-lifecycle.md` | S1 |
| C4 | **Decision Register integrity** | Is the register complete, traceable, audited, and trusted? | `03-decision-register-governance.md` | S1 |
| C5 | **Ownership & accountability** | Does every architectural element have a real, accountable owner? | `04-architecture-ownership.md` | S1 |
| C6 | **Change management** | Are baseline changes controlled through a disciplined ACR process? | `05-change-management.md` | S1 |
| C7 | **Evolution & roadmapping** | Is the architecture steered deliberately (fitness functions, deprecation)? | `06-architecture-evolution.md` | S2 |
| C8 | **Technical-debt governance** | Is debt identified, quantified, accepted, and paid down deliberately? | `07-technical-debt-governance.md` | S2 |
| C9 | **Exception & waiver control** | Are deviations time-boxed, recorded, and adjudicated by the right authority? | `08-exception-management.md` | S1 |
| C10 | **Drift detection & remediation** | Is divergence between baseline and reality detected and closed? | `09-architecture-drift-detection.md` | S1 |
| C11 | **Cross-domain dependency management** | Are inter-domain contracts and blast radius governed? | `10-cross-domain-dependency-mgmt.md` | S2 |
| C12 | **Release & sprint approval** | Are architecture gates at sprint and release real and evidence-based? | `11-` and `12-…approval.md` | S1 |

> **S1-critical capabilities** (C1, C3, C4, C5, C6, C9, C10, C12) are the load-
> bearing structure of governance. The overall maturity score is *gated* by the
> weakest of these (§7.3): an organization cannot claim strong governance while
> any load-bearing capability is weak, no matter how good the others are.

---

## 5. The capability × level rubric (the core of the model)

This is the heart of the model. For each capability, the observable criteria at
each level are defined. An assessor scores a capability by finding the **highest
level whose criteria are fully met with evidence** (respecting the cumulative
rule of §3.6).

The rubric below is given in full for the eight S1-critical capabilities and in
summary for the S2 capabilities; the complete rubric for all twelve is
consolidated in Appendix A.

### 5.1 C1 — Operating model & authority

| Level | Observable criteria |
| --- | --- |
| 0 | Governance bodies are named but do not convene; no quorum has ever been recorded; authority is asserted in a document but not exercised. |
| 1 | A body convenes only in crises; attendance and authority are improvised per meeting; decisions rest on whoever is most senior in the room. |
| 2 | A named board meets on major decisions with a rough agenda; authority for *major* decisions is understood; minor decisions bypass it. |
| 3 | Bodies, cadence, quorum, and a full decision-authority matrix are documented, published, and honored for all in-scope decisions; escalation paths are defined and used. |
| 4 | Board effectiveness is measured (decision lead time, quorum-met rate, escalation rate, reversal rate); metric breaches trigger operating-model adjustments. |
| 5 | The operating model is periodically re-designed from its own performance data; authority is delegated or centralized deliberately based on measured outcomes. |

### 5.2 C3 — ADR discipline

| Level | Observable criteria |
| --- | --- |
| 0 | Architecturally significant decisions are made with no written record of the decision, options, or rationale. |
| 1 | Some decisions are written down somewhere (chat, email, slides), inconsistently, with no lifecycle. |
| 2 | ADRs are written for *major* decisions using a template, stored in a known location; lifecycle states are informal. |
| 3 | Every architecturally significant decision has an ADR; the full lifecycle (`Proposed → Accepted → Superseded/Deprecated/…`) is honored; supersession chains are maintained. |
| 4 | ADR coverage, lead time, and staleness are measured; gaps (decisions without ADRs) are detected and closed; ADR quality is scored against a checklist. |
| 5 | ADR practice improves from data — templates and criteria evolve based on which ADRs later proved right or wrong; decision quality is retrospected. |

### 5.3 C4 — Decision Register integrity

| Level | Observable criteria |
| --- | --- |
| 0 | No central register, or a register that is known to be incomplete and untrusted. |
| 1 | A partial list exists; nobody trusts it to be complete; entries are added inconsistently. |
| 2 | A register exists and is populated for major decisions; schema is loosely followed; traceability to ADRs is partial. |
| 3 | A single authoritative register with an enforced schema; every decision traces to its ADR and its owner; the register is the trusted source; periodic audits occur. |
| 4 | Register completeness and integrity are measured (orphan rate, traceability coverage, audit-finding rate); anomalies trigger reconciliation. |
| 5 | Register governance self-improves; audit findings feed schema and process changes; integrity approaches provable. |

### 5.4 C5 — Ownership & accountability

| Level | Observable criteria |
| --- | --- |
| 0 | Ownership is undefined; "everyone owns it" (i.e., no one does); orphaned components are common and unrecognized. |
| 1 | Ownership is known informally for a few key components via tribal memory; most of the estate has no clear owner. |
| 2 | Major domains have named owners; ownership of shared/edge components is contested or vague. |
| 3 | Every architectural element maps to an accountable owner via a maintained ownership model; RACI is explicit; orphan detection exists. |
| 4 | Ownership coverage and orphan rate are measured; ownership gaps are detected and assigned within an SLA; owner responsiveness is tracked. |
| 5 | The ownership model adapts to organizational change automatically-ish; churn and reassignment are managed deliberately from data. |

### 5.5 C6 — Change management

| Level | Observable criteria |
| --- | --- |
| 0 | Frozen baselines are changed silently; there is no change-request concept. |
| 1 | Significant changes sometimes get a heads-up to an architect; no defined ACR process; approval is informal. |
| 2 | Major baseline changes go through a defined request-and-approve flow; minor changes slip through; states are informal. |
| 3 | All baseline changes flow through the ACR lifecycle (`Raised → Triaged → … → Verified → Closed`); the right authority approves per the authority matrix; diffs against the baseline are mandatory. |
| 4 | Change lead time, rejection/rework rate, emergency-change rate, and post-change incident rate are measured and managed. |
| 5 | The change process self-optimizes; emergency-change rate is driven down by root-cause analysis; the process adapts to change velocity. |

### 5.6 C9 — Exception & waiver control

| Level | Observable criteria |
| --- | --- |
| 0 | Deviations from the baseline happen with no record and no expiry; "temporary" is permanent. |
| 1 | Exceptions are granted verbally by whoever is asked; no expiry; no record. |
| 2 | Major exceptions are recorded with a rationale; expiry is sometimes set; approval authority is inconsistent. |
| 3 | All exceptions and waivers are recorded, time-boxed, and approved by the correct authority (never self-approved); conditions and expiry are enforced; revocation is possible. |
| 4 | Exception count, aging, renewal rate, and expiry-breach rate are measured; aged exceptions trigger escalation. |
| 5 | Exception patterns feed architecture evolution — recurring exceptions become deliberate baseline changes; the "why do we keep waiving this?" loop is closed. |

### 5.7 C10 — Drift detection & remediation

| Level | Observable criteria |
| --- | --- |
| 0 | No concept of drift; nobody compares the running system to the frozen baseline. |
| 1 | Drift is noticed accidentally, usually during an incident, and addressed reactively. |
| 2 | Drift is checked manually at major milestones; findings are recorded for major systems only. |
| 3 | Drift is detected systematically against the baseline; findings are classified by severity and routed to remediate/waive/promote-to-change; closure is tracked. |
| 4 | Drift rate, detection latency, and remediation lead time are measured; drift trends are watched; thresholds trigger action. |
| 5 | Drift detection is increasingly automated and predictive; root causes of recurring drift are designed out; drift rate trends down by design. |

### 5.8 C12 — Release & sprint approval

| Level | Observable criteria |
| --- | --- |
| 0 | Releases ship with no architecture gate; "approval" is a formality nobody performs. |
| 1 | An architect is sometimes asked to bless a big release; no defined gate; no evidence pack. |
| 2 | Major releases have an architecture sign-off with a rough checklist; sprints are ungated. |
| 3 | Both sprint and release architecture gates are defined, evidence-based, and enforced; approval records are produced; go/no-go authority is explicit. |
| 4 | Gate pass/fail rates, conditional-approval rates, and post-release architecture-incident rates are measured and managed. |
| 5 | Gate criteria self-tune from post-release outcomes; false-pass and false-block rates are driven down with data. |

### 5.9 S2 capabilities (summary — full rubric in Appendix A)

- **C2 — Lifecycle & stage gates:** 0 no lifecycle → 3 defined phases with
  enforced entry/exit gates org-wide → 5 gates tuned from throughput/quality data.
- **C7 — Evolution & roadmapping:** 0 no roadmap → 3 deliberate roadmaps with
  fitness functions and deprecation policy → 5 evolution steered quantitatively.
- **C8 — Technical-debt governance:** 0 debt invisible → 3 debt ledger with
  accepted items, interest, and paydown scheduling → 5 debt managed as a
  portfolio with measured interest and ROI-ranked paydown.
- **C11 — Cross-domain dependency management:** 0 dependencies undiscovered → 3
  dependency register with governed contracts and blast-radius analysis → 5
  dependency health measured and contract evolution managed.

---

## 6. Evidence model — what counts as proof at each level

**No evidence, no level.** A capability is scored at Level *N* only when the
assessor can point to concrete, inspectable artifacts demonstrating the criteria.
The evidence *class* required rises with the level:

| Level | Evidence class required | Examples |
| --- | --- | --- |
| 0 | Absence evidence | No register entries, no minutes, no records found despite looking. |
| 1 | Anecdotal artifacts | A chat thread, an email, a slide where a decision was made. |
| 2 | Local artifacts | A team register, populated templates for major items, a wiki page. |
| 3 | Standardized artifacts | The single org register, the authority matrix, training records, consistent templates across ≥2 independently-inspected domains. |
| 4 | Quantitative artifacts | Live dashboards, KPI histories against targets, control charts, breach-triggered action logs. |
| 5 | Improvement-loop artifacts | Governance retrospectives, before/after metric deltas traced to a specific process change, a change log of the governance process itself. |

**Evidence hygiene rules**

1. **Inspectable, not asserted.** "We do X" is not evidence; the artifact showing
   X is. Interviews *locate* evidence; they are not themselves evidence for
   Level ≥ 3.
2. **Recent, not historical.** Evidence must fall within the capability's
   *freshness window* (default: the last two assessment cycles). A dashboard that
   last updated a year ago is not Level-4 evidence.
3. **Representative, not cherry-picked.** For Level ≥ 3, evidence must cover a
   *sample* across domains, not the one flagship team. Sampling method is
   recorded (§8.4).
4. **Independent, not self-graded.** Self-assessment is admissible as input but is
   *discounted* (§7.4) until corroborated by inspectable artifacts.

---

## 7. Scoring methodology

### 7.1 Per-capability scoring

Each of the 12 capabilities receives an integer 0–5, being the **highest level
whose criteria are fully met with in-window evidence**, respecting cumulativity
(§3.6). Partial satisfaction does not round up: a capability that meets all of
Level 3 and half of Level 4 scores **3**, with the half-met Level-4 criteria
recorded as the *next step*.

### 7.2 Half-level notation (advisory only)

For roadmap communication, an assessor may annotate a score as `3→4 (40%)` to
signal progress toward the next level. **The scored value remains the integer.**
Half-levels never appear in the gated overall score.

### 7.3 The gated overall score (not a mean)

The overall maturity is **not** the average of the twelve capabilities. Averaging
lets strong capabilities mask a critical weakness — the exact failure the model
exists to prevent. Instead:

```
Overall Maturity = min( floor(mean of all 12) , min(S1-critical capabilities) )
```

- The **mean** provides the general altitude.
- The **S1-critical floor** caps it: the overall score can never exceed the
  weakest load-bearing capability (C1, C3, C4, C5, C6, C9, C10, C12).

**Worked illustration.** Suppose eleven capabilities score 4 and C10 (drift)
scores 1. The mean is ≈ 3.75 → floor 3. But C10 is S1-critical and scores 1, so
the overall is **min(3, 1) = 1**. The organization is *Level 1* overall, because
it cannot detect divergence between its baseline and reality — no amount of
excellence elsewhere compensates for that.

### 7.4 Confidence and the self-assessment discount

Each capability score carries a **confidence rating** driven by evidence quality:

| Confidence | Basis | Effect |
| --- | --- | --- |
| High | Independent, inspectable, representative evidence | Score stands. |
| Medium | Some independent evidence; some self-report | Score stands; flagged for re-check next cycle. |
| Low | Predominantly self-report; thin artifacts | Score is capped at **2** until corroborated. |

The self-assessment discount (Low → cap 2) exists because Levels 3+ are
*definitionally* about standardization and measurement, which cannot be
established by assertion.

### 7.5 What the overall number is (and is not) for

- ✅ It is a portfolio signal, a trend line, and a gate on the weakest load-
  bearing capability.
- ❌ It is not a target, a KPI for a team, or a comparison stick between domains
  for reward or blame (§1.2, §12.1).

---

## 8. The assessment process (end-to-end)

An architecture-governance maturity assessment follows a defined lifecycle. This
is a *governance* process and obeys the read-only contract: it produces a
finding; it records an artifact only on explicit request.

### 8.1 Phase 1 — Scoping

- Define the **assessment unit**: the whole organization, a portfolio, a domain,
  or a program. Maturity is meaningful at each altitude but must not be mixed in
  one score.
- Confirm the **target maturity** for the unit from the risk tiering (§14). You
  cannot judge a gap without a target.
- Identify the **evidence owners** for each capability (typically the accountable
  owner from `references/04`).
- Fix the **freshness window** and the **sampling plan** (§8.4).

### 8.2 Phase 2 — Evidence collection

- For each capability, gather artifacts per the evidence model (§6).
- Interviews are used to *locate and contextualize* evidence, never to substitute
  for it at Level ≥ 3.
- Missing evidence is recorded as *absence evidence*, which is itself a finding.

### 8.3 Phase 3 — Scoring

- Two assessors score independently against the rubric (§5, Appendix A).
- Divergences are reconciled through evidence, not debate; unresolved divergence
  is escalated to the calibration lead (§11) and recorded as a model-clarity
  finding.
- Confidence ratings and the self-assessment discount (§7.4) are applied.

### 8.4 Sampling plan (for Level ≥ 3 claims)

Standardization and measurement claims require breadth. The default sample:

- **≥ 3 domains** or **30% of domains**, whichever is greater, selected to include
  at least one flagship, one peripheral, and one recently-formed team.
- For each sampled domain, inspect the *actual artifacts* (register entries, ADRs,
  approval records) — not the domain's description of them.
- The sampling method and the specific units inspected are recorded so the
  assessment is reproducible.

### 8.5 Phase 4 — Gap analysis

- For each capability, identify the *specific* criteria at the next level that are
  unmet, and the *specific* evidence that would satisfy them.
- Distinguish **quick wins** (one artifact or one process fix away) from
  **structural gaps** (require organizational change, e.g., establishing a real
  board).

### 8.6 Phase 5 — Roadmap

- Convert gaps into a sequenced improvement roadmap (§13), prioritized by
  risk-weighted gap (§13.2), not by ease.

### 8.7 Phase 6 — Reporting

- Produce the assessment report (§15). Record it as an artifact **only if the user
  explicitly requests it.** Otherwise the assessment is delivered as advisory
  findings.

---

## 9. Roles in a maturity assessment

| Role | Responsibility in the assessment | Sourced from |
| --- | --- | --- |
| **Assessment sponsor** | Commissions the assessment, sets scope and target, owns the roadmap outcome. | Chief Architect / ARB chair (`references/13`) |
| **Lead assessor** | Runs the process, owns scoring integrity, reconciles divergence. | Governance function / independent |
| **Second assessor** | Independent parallel scorer for the S1-critical capabilities. | Peer domain / independent |
| **Calibration lead** | Guardian of the rubric; resolves interpretation disputes; owns model versioning (§11). | Governance function |
| **Evidence owners** | Provide inspectable artifacts per capability; do **not** score their own capability. | Domain Architecture Owners (`references/04`) |
| **Recorder** | Captures scores, evidence pointers, and findings; produces the report on request. | Governance function |

> **Independence rule.** The person accountable for a capability's *performance*
> may not be the sole assessor of that capability's *maturity*. This mirrors the
> exception-management principle that a requester cannot be the sole approver
> (`SKILL.md` §8; `references/08`).

---

## 10. Cadence, triggers, and scope of assessments

### 10.1 Scheduled cadence

| Assessment unit | Default cadence | Shelf life of the score |
| --- | --- | --- |
| Organization-wide | Annual | 12 months |
| Portfolio / domain | Semi-annual | 6 months |
| Program (high-risk) | Quarterly | 3 months |

A score past its shelf life is marked **stale** and must not be used for
decisions until refreshed.

### 10.2 Event triggers (assess out of cadence)

Reassess a unit when any of the following occurs, because they materially change
governance maturity:

- A **major governance failure** (an S1 drift breach, a cross-domain outage from
  an ungoverned contract, a release that bypassed the gate).
- A **reorganization** that changes ownership or the operating model.
- A **merger/acquisition** bringing a differently-governed estate.
- A **material change in the operating model** (a new board, a changed authority
  matrix).
- **Roadmap milestone completion** — verify the claimed maturity gain actually
  landed.

### 10.3 Scope discipline

Do not blend altitudes. A "Level 3" organization may contain a Level-1 program
and a Level-4 flagship; the organization-level score describes the *system*, and
the domain-level scores describe the *parts*. Both are reported; neither is
averaged into a single misleading number across altitudes.

---

## 11. Benchmarking and calibration

### 11.1 Internal calibration (mandatory)

Before an assessment cycle, all assessors calibrate against **reference cases** —
anonymized, pre-scored evidence bundles with agreed answers. An assessor whose
scores diverge from the reference by more than one level on any capability is
re-calibrated before assessing live units. This keeps the rubric from drifting
into per-assessor reinterpretation (§2, model-drift countermeasure).

### 11.2 The rubric is versioned

The rubric (§5, Appendix A) is a governed artifact with a version number. Changes
to it follow the same discipline as any governance change: proposed, reviewed by
the calibration lead, approved by the ARB, recorded. A score always cites the
rubric version it was made against, so historical scores remain interpretable.

### 11.3 External benchmarking (advisory, optional)

External maturity benchmarks (industry frameworks, peer comparisons) are used
only to *sanity-check* internal scores, never to replace them. External
frameworks use different scales; mapping is approximate and must be labeled as
such. Do not let an external badge substitute for internal evidence.

---

## 12. Anti-patterns and maturity theatre

The following patterns produce a flattering score while governance quietly fails.
An assessor actively hunts for these and records them as findings even when the
raw criteria appear met.

### 12.1 Grade-chasing / target inversion

The score becomes the goal. Teams produce the *artifacts* that signal a level
without the *behavior* the artifacts are supposed to evidence — a register that is
populated the week before assessment and abandoned after. **Detection:** check
artifact freshness across the year, not just at assessment time.

### 12.2 The Potemkin register

A register/ADR store that is complete and beautiful but *not used to make
decisions* — decisions are made elsewhere and the register is a post-hoc
transcription (or fabrication). **Detection:** trace a sample of *actual recent
decisions* and check they appear in the register with correct timing; trace
register entries back to real decision moments.

### 12.3 Board theatre

A board that convenes, has minutes, and quorum — but rubber-stamps; it has never
rejected or materially changed a proposal. **Detection:** inspect the reject /
rework / conditional-approval rate. A board with a ~100% approval rate is either
superfluous or not actually deciding.

### 12.4 Instrumentation without foundation

Dashboards and KPIs (Level-4 signals) built on a process that is not actually
standardized (a Level-3 requirement). The metrics measure noise. **Detection:**
the cumulativity rule (§3.6) — verify Level 3 *before* crediting Level 4.

### 12.5 The permanent temporary

Exceptions and waivers that are recorded and time-boxed on paper but perpetually
renewed, so "temporary" deviations are structurally permanent. **Detection:**
exception aging and renewal-count distribution; a long tail of many-times-renewed
exceptions is drift wearing a waiver.

### 12.6 Ownership on paper

An ownership model that is complete in the tool but where the named owners cannot,
in practice, exercise ownership (no authority, no time, no awareness).
**Detection:** owner-responsiveness data; ask a sample of named owners about their
components and observe recognition.

### 12.7 Assessment as blame

Using maturity scores to rank and punish teams. This does not flatter the score —
it *corrupts the data*, because teams then game and hide. It is the most
destructive anti-pattern and is a finding against *the governance function
itself*, not the assessed team.

---

## 13. The maturity improvement roadmap

An assessment that does not end in a roadmap has failed at its purpose.

### 13.1 From gaps to moves

Each gap (§8.5) becomes a **move**: a specific, owned, time-bound change that
raises a named capability by satisfying named next-level criteria with named
evidence. A move states:

- the capability and the level transition (`C10: 2 → 3`),
- the specific criteria to satisfy,
- the evidence that will prove it,
- the owner (an accountable role, not "the team"),
- the target date and the verification method.

### 13.2 Prioritization — risk-weighted gap, not ease

Moves are sequenced by **risk-weighted gap**, computed as:

```
Priority = (Target level − Current level) × Capability criticality weight × Blast radius
```

- **S1-critical capabilities** carry the highest weight — closing the gated floor
  (§7.3) is almost always the first move, because it unlocks the overall score.
- **Ease is a tiebreaker, not a driver.** The temptation to bank easy Level-1→2
  wins on non-critical capabilities while the S1 floor languishes is the roadmap
  version of maturity theatre.

### 13.3 Sequencing rules

1. **Raise the floor first.** The single lowest S1-critical capability gates
   everything; fix it before polishing anything above it.
2. **Foundations before instrumentation.** Reach Level 3 (standardized) on a
   capability before investing in Level-4 measurement for it (§12.4).
3. **One structural move at a time per domain.** Structural changes (new board,
   new ownership model) are disruptive; parallelizing them across a domain causes
   change fatigue and rollback.
4. **Verify before claiming.** A move is complete only when its evidence is
   independently inspectable — not when the work is "done."

### 13.4 The roadmap horizon

- **Near (0–1 cycle):** raise the gated floor; close quick-win Level-1/2 gaps on
  S1-critical capabilities.
- **Mid (1–3 cycles):** standardize all S1-critical capabilities to Level 3;
  begin S2 standardization.
- **Long (3+ cycles):** instrument (Level 4) where risk justifies; pursue
  optimizing (Level 5) only on the highest-risk, highest-scale capabilities.

---

## 14. Target operating maturity and the "good enough" question

### 14.1 Level 5 is usually the wrong target

Maturity is not free. Each level costs process, tooling, measurement, and
attention. Beyond the point where governance reliably prevents the failures that
matter for a given system, additional maturity is **waste** — governance overhead
that slows delivery without reducing meaningful risk.

### 14.2 Risk-tiered targets

Target maturity is set **per capability, per risk tier**, not uniformly.

| Risk tier | Description | Typical target on S1-critical caps | Typical target on S2 caps |
| --- | --- | --- | --- |
| **Tier 1 — Critical** | Regulated, safety-critical, or company-existential systems; high blast radius | 4–5 | 3–4 |
| **Tier 2 — Core** | Flagship products; significant but bounded blast radius | 3–4 | 3 |
| **Tier 3 — Supporting** | Internal or peripheral systems; low blast radius | 3 | 2–3 |
| **Tier 4 — Experimental** | Sandboxes, prototypes, deliberately low-governance zones | 2 | 1–2 |

> A Tier-4 experiment scored at Level 2 is **at target**, not immature. Reporting
> it as a "gap" is a category error and pushes waste into places designed for
> speed. Conversely, a Tier-1 system at Level 2 on C10 (drift) is a **critical
> finding** regardless of how new or small it is.

### 14.3 Over-maturity as a finding

The model explicitly flags capabilities scored *above* their risk-tier target as
**over-governed**, prompting the question: *is this ceremony buying us risk
reduction, or is it drag?* Governance that governs itself must be willing to
*reduce* maturity where it has become theatre or waste.

---

## 15. Reporting a maturity assessment

A maturity assessment report contains, at minimum:

1. **Scope & target** — the unit assessed, its risk tier(s), and the target
   maturity per capability.
2. **The scorecard** — the 12 capability scores with confidence ratings, and the
   gated overall (§7.3) with the gating capability named.
3. **The gap analysis** — per capability, current vs. target, and the specific
   unmet criteria.
4. **Findings** — including any anti-patterns / maturity theatre detected (§12),
   over-governance (§14.3), and stale/self-assessed capabilities.
5. **The roadmap** — sequenced, risk-weighted moves (§13) with owners and dates.
6. **Evidence appendix** — pointers to the inspected artifacts and the sampling
   plan, so the assessment is reproducible.
7. **Provenance** — assessors, rubric version, freshness window, and the score's
   shelf-life expiry.

**Reporting discipline (per the read-only contract):**

- Deliver upward only the **portfolio trend, the gated floor, and the risk-
  weighted gaps** — never a team leaderboard (§12.7).
- The report is produced as an **advisory finding** by default; it is written as a
  recorded artifact **only on explicit request**, using the register conventions
  of `references/03`.

---

## 16. Worked example — a full assessment

> *Illustrative. Fictional unit "Payments Domain," Tier 1.*

**Scope.** Payments Domain, Tier 1. Targets: S1-critical → 4, S2 → 3.
Freshness window: last 6 months. Sample: 3 teams (flagship "Ledger,"
peripheral "Statements," new "Wallet-NG").

**Scores (after independent scoring, reconciliation, and the self-assessment
discount):**

| Cap | Score | Confidence | Target | Gap | Note |
| --- | --- | --- | --- | --- | --- |
| C1 Operating model | 4 | High | 4 | 0 | Board metrics tracked; at target. |
| C2 Lifecycle gates | 3 | High | 3 | 0 | At target. |
| C3 ADR discipline | 3 | High | 4 | −1 | Coverage measured only for Ledger, not org-wide. |
| C4 Register integrity | 3 | Medium | 4 | −1 | Audits ad hoc; no orphan-rate metric. |
| C5 Ownership | 4 | High | 4 | 0 | At target. |
| C6 Change mgmt | 3 | High | 4 | −1 | Emergency-change rate untracked. |
| C9 Exceptions | 2 | High | 4 | −2 | "Permanent temporary" pattern in Statements (§12.5). |
| C10 Drift | 2 | High | 4 | −2 | Manual drift checks only; Wallet-NG never checked. |
| C12 Release/sprint gate | 3 | High | 4 | −1 | Gate exists; pass/fail rates not measured. |
| C7 Evolution | 2 | Medium | 3 | −1 | Roadmaps exist; no fitness functions. |
| C8 Tech debt | 3 | High | 3 | 0 | At target. |
| C11 Cross-domain deps | 2 | Medium | 3 | −1 | Register partial; blast radius not analyzed. |

**Gated overall.** Mean ≈ 2.83 → floor 2. Weakest S1-critical = **2** (C9 and
C10). Overall = **min(2, 2) = 2 — Level 2 (Repeatable).**

**Headline finding.** Despite a strong operating model and ownership, the domain
is **Level 2 overall because it cannot reliably detect drift (C10=2) or control
deviations (C9=2)** — the two capabilities that keep a *frozen baseline* honest.
For a Tier-1 payments domain this is a **critical governance risk**: the recorded
architecture and the running system may diverge undetected.

**Roadmap (risk-weighted, floor-first):**

1. **Move C10: 2 → 3** (highest priority — raises the gated floor). Establish
   systematic drift detection against the baseline for *all* payments teams
   including Wallet-NG; classify and route findings. Owner: Domain Architecture
   Owner. Verify: drift findings recorded across all 3 sampled teams.
2. **Move C9: 2 → 3** (co-priority). Time-box and re-adjudicate the Statements
   "permanent temporary" exceptions; enforce expiry and independent approval.
3. **Then** raise C3/C4/C6/C12 from 3 → 4 via measurement, once the floor is at 3.
4. **Defer** C7 fitness functions (S2, at-tier-adjacent) until the S1 floor
   reaches target.

**Note on discipline.** The eight strong-ish scores did *not* pull the overall
up; the two weak load-bearing capabilities correctly gated it. That is the model
working as designed.

---

## 17. Integration with the governance operating model

- **Who owns the model.** The maturity model is owned by the governance function
  and governed by the ARB (`references/00`). The calibration lead (§9, §11) is the
  rubric's custodian.
- **How assessments are commissioned.** Via the operating model's cadence and
  event triggers (§10); the ARB is the assessment sponsor for organization-wide
  and Tier-1 assessments.
- **How the model itself changes.** The rubric is versioned and changes through
  the ARB (§11.2) — meta-governance obeys the same change discipline it imposes.
- **Where the numbers come from.** All Level-4/5 quantitative evidence draws on
  the KPIs defined in `references/14-metrics-kpis-and-reporting.md`. If a metric
  the rubric requires does not exist in `references/14`, that is a gap in the
  measurement capability, scored accordingly — not a reason to credit the level.
- **Feedback into evolution.** Recurring low scores on a capability are an input
  to architecture evolution (`references/06`) and to the operating model's own
  redesign — the Level-5 self-improvement loop applied to governance itself.

---

## 18. Appendix A — capability rubric summary tables

> Consolidated 0–5 criteria for all twelve capabilities. S1-critical capabilities
> reproduce §5; S2 capabilities are given in full here.

### A.1 S1-critical capabilities (see §5.1–§5.8 for full criteria)

| Cap | L0 | L1 | L2 | L3 | L4 | L5 |
| --- | --- | --- | --- | --- | --- | --- |
| C1 Operating model | Named, never convenes | Crisis-only | Major-decision board | Full authority matrix, honored | Board effectiveness measured | Model redesigned from data |
| C3 ADR discipline | No records | Scattered notes | ADRs for major items | All ASDs, lifecycle honored | Coverage/quality measured | Practice improved from outcomes |
| C4 Register integrity | None/untrusted | Partial list | Major items, loose schema | Single authoritative, audited | Integrity measured | Self-improving integrity |
| C5 Ownership | Undefined | Tribal | Domains owned, edges vague | Every element owned, RACI | Coverage/orphan measured | Adapts to org change |
| C6 Change mgmt | Silent changes | Informal heads-up | Major ACR flow | All changes via ACR lifecycle | Change KPIs managed | Self-optimizing change |
| C9 Exceptions | Unrecorded, no expiry | Verbal, no expiry | Major recorded | All time-boxed, independent approval | Aging/renewal measured | Patterns feed evolution |
| C10 Drift | No concept | Accidental | Manual at milestones | Systematic, classified, routed | Drift KPIs managed | Predictive, designed-out |
| C12 Release/sprint gate | No gate | Occasional blessing | Major sign-off | Both gates, evidence-based | Gate KPIs managed | Criteria self-tune |

### A.2 S2 capabilities (full criteria)

**C2 — Lifecycle & stage gates**

| Level | Criteria |
| --- | --- |
| 0 | No architecture lifecycle concept; work has no phases or gates. |
| 1 | Phases exist informally for some projects; gates skipped under pressure. |
| 2 | Major programs follow defined phases with entry/exit gates; small work exempt. |
| 3 | One lifecycle with enforced entry/exit gates applied org-wide to all qualifying work. |
| 4 | Gate throughput, hold time, and pass/fail rates measured and managed. |
| 5 | Gate criteria and phase boundaries tuned from flow and quality data. |

**C7 — Evolution & roadmapping**

| Level | Criteria |
| --- | --- |
| 0 | No architecture roadmap; the architecture drifts wherever delivery pushes it. |
| 1 | A roadmap slide exists but does not drive decisions. |
| 2 | Domains maintain roadmaps; deprecation is ad hoc. |
| 3 | Deliberate roadmaps with fitness functions and a deprecation/sunset policy, applied org-wide. |
| 4 | Roadmap adherence and fitness-function results measured; deviations trigger review. |
| 5 | Evolution steered quantitatively; fitness functions evolve; deprecation driven by data. |

**C8 — Technical-debt governance**

| Level | Criteria |
| --- | --- |
| 0 | Debt is invisible; the word is used but nothing is tracked. |
| 1 | Debt noted anecdotally in backlogs; no acceptance or expiry. |
| 2 | Major debt items recorded with rough severity; paydown ad hoc. |
| 3 | A debt ledger with accepted items, interest estimation, and scheduled paydown, applied org-wide. |
| 4 | Debt volume, interest, and paydown rate measured and managed. |
| 5 | Debt managed as a portfolio; paydown ROI-ranked; interest reduced by design. |

**C11 — Cross-domain dependency management**

| Level | Criteria |
| --- | --- |
| 0 | Cross-domain dependencies are undiscovered until they break. |
| 1 | Some dependencies known informally; no register. |
| 2 | Major dependencies listed; contracts implicit. |
| 3 | A dependency register with governed contracts and blast-radius analysis, applied org-wide. |
| 4 | Dependency health, contract-breach rate, and blast radius measured and managed. |
| 5 | Dependency evolution managed deliberately; contract change piloted and measured. |

---

## 19. Appendix B — assessment questionnaire bank

> Questions are prompts to *locate evidence*, not scoring shortcuts. Each question
> is followed by the evidence that would substantiate a Level-3+ answer.

**C1 — Operating model**
- When did the architecture board last convene, and where are the minutes?
  *(Evidence: a cadence of recent minutes with quorum recorded.)*
- Show the decision-authority matrix. Who approved the last cross-domain ADR?
  *(Evidence: published matrix + a real decision traced to the named authority.)*
- Show a decision that was escalated. What triggered it?
  *(Evidence: an escalation record with a defined trigger.)*

**C3 — ADR discipline**
- Show the last five architecturally significant decisions. Where are their ADRs?
  *(Evidence: five ADRs, correctly dated, with options and rationale.)*
- Show a superseded ADR and its successor chain.
  *(Evidence: an intact supersession link.)*
- How do you know a decision is *missing* an ADR?
  *(Evidence: a coverage/gap-detection mechanism — Level-4 signal.)*

**C4 — Register integrity**
- Is there one register or several? Which is authoritative?
- Show the last audit of the register and its findings.
- Pick a register entry at random — trace it to its ADR and its owner.

**C5 — Ownership**
- Show the ownership model. Name the owner of a shared/edge component.
- How are orphaned components detected?
- Ask a named owner about their component — do they recognize it?

**C6 — Change management**
- Show the last change to a frozen baseline. Where is its ACR?
- What is your emergency-change rate? *(Level-4 signal.)*
- Show a rejected ACR and the reason.

**C9 — Exceptions**
- Show all active exceptions and their expiry dates.
- Who approved the most recent waiver? Could they have requested it too?
- Show your most-renewed exception. Why is it still temporary?

**C10 — Drift**
- How is the running system compared to the frozen baseline?
- Show the last drift finding and how it was classified and closed.
- Which systems have *never* been drift-checked?

**C12 — Release/sprint gate**
- Show the architecture approval record for the last release.
- What is the gate's pass/fail and conditional rate? *(Level-4 signal.)*
- Show a release that was blocked or conditionally approved at the gate.

*(S2 capability questions follow the same pattern — locate the register, the
roadmap, the ledger, the dependency contracts, and trace a real instance.)*

---

## 20. Appendix C — maturity scoring worksheet

```
UNIT: __________________________  RISK TIER: ____  RUBRIC VERSION: ____
FRESHNESS WINDOW: ____________     SAMPLING PLAN: __________________________
ASSESSORS: lead __________  second __________  calibration lead __________

CAPABILITY              SCORE  CONF   TARGET  GAP   GATING?  EVIDENCE PTR
C1 Operating model      [ ]    [ ]    [ ]     [ ]   [ ]      __________
C2 Lifecycle gates      [ ]    [ ]    [ ]     [ ]   [ ]      __________
C3 ADR discipline       [ ]    [ ]    [ ]     [ ]   [S1]     __________
C4 Register integrity   [ ]    [ ]    [ ]     [ ]   [S1]     __________
C5 Ownership            [ ]    [ ]    [ ]     [ ]   [S1]     __________
C6 Change management    [ ]    [ ]    [ ]     [ ]   [S1]     __________
C7 Evolution            [ ]    [ ]    [ ]     [ ]   [ ]      __________
C8 Technical debt       [ ]    [ ]    [ ]     [ ]   [ ]      __________
C9 Exceptions           [ ]    [ ]    [ ]     [ ]   [S1]     __________
C10 Drift               [ ]    [ ]    [ ]     [ ]   [S1]     __________
C11 Cross-domain deps   [ ]    [ ]    [ ]     [ ]   [ ]      __________
C12 Release/sprint gate [ ]    [ ]    [ ]     [ ]   [S1]     __________

MEAN (all 12): ______   FLOOR(mean): ______
MIN(S1-critical): ______   ← gating capability: ______
GATED OVERALL = min(floor(mean), min S1-critical) = ______  → LEVEL: ______

SHELF-LIFE EXPIRY: __________   ANTI-PATTERNS FOUND: __________________________
```

---

## 21. Appendix D — glossary deltas

Terms introduced by this reference (add to
`references/15-glossary-and-taxonomy.md`):

- **Governance maturity** — the degree to which governance outcomes are produced
  predictably, repeatably, and with evidence, independent of individuals.
- **Gated overall score** — the maturity score capped by the weakest S1-critical
  capability rather than an average (§7.3).
- **S1-critical capability** — a load-bearing governance capability that gates the
  overall maturity score (C1, C3, C4, C5, C6, C9, C10, C12).
- **Cumulativity rule** — a capability is at Level N only if all lower levels are
  also satisfied (§3.6).
- **Self-assessment discount** — the capping of a score at Level 2 when evidence
  is predominantly self-reported (§7.4).
- **Risk-tiered target** — the per-capability target maturity set by a unit's risk
  tier, against which gaps and over-governance are judged (§14).
- **Maturity theatre** — patterns that produce a flattering score while governance
  fails in practice (§12).
- **Risk-weighted gap** — the prioritization measure sequencing improvement moves
  by criticality and blast radius, not ease (§13.2).
- **Freshness window** — the recency bound within which evidence must fall to count
  toward a level (§6, §8.1).
- **Gated floor** — the lowest S1-critical capability score, which the roadmap
  raises first (§13.3).

---

*Governance Maturity Model — the meta-governance yardstick. It grades how well
the organization performs every other governance function, ends every assessment
in a risk-weighted roadmap, and, being read-only, produces findings — never code.*
