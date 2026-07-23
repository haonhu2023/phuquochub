# POLICY — Architecture Governance Compliance

> **Document class:** Binding organizational policy.
> **Status:** Normative. The requirements in this policy are mandatory for all
> in-scope parties (§4). Where this policy uses **MUST / MUST NOT / SHALL /
> SHALL NOT**, the requirement is obligatory; **SHOULD / SHOULD NOT** denotes a
> strong recommendation from which deviation requires a recorded rationale; **MAY**
> denotes an option.
>
> **Read-only contract.** This policy *binds* behavior; it does not *perform* it.
> The Architecture Governance skill uses this policy to **judge conformance,
> render compliance findings, and route obligations** — it does not enforce the
> policy by taking side-effectful action, and it never generates production code
> (`SKILL.md` §2). Recording a compliance finding, a waiver, or an obligation is
> done only on explicit request, through the artifacts defined in
> `references/19-governance-metadata-schema.md`.
>
> **Relationship to the rest of the skill.** A *reference* explains how a
> governance function works; a *policy* states what is **obligatory** about it and
> **what happens when the obligation is not met.** This policy is the binding
> compliance layer over every governance function (`references/00`–`19`). It draws
> authority from `references/00` (operating model), is verified by `references/17`
> (audit), routes via `references/18` (decision trees), and records through
> `references/19` (schema). It is the sibling of, and consistent with,
> `policies/architecture-governance-policy.md` (the master policy),
> `policies/exception-and-waiver-policy.md`, `policies/technical-debt-policy.md`,
> and `policies/escalation-policy.md`.

---

## Table of contents

1. Purpose
2. Policy statement (the binding commitment)
3. Definitions
4. Scope and applicability
5. Authority and ownership of this policy
6. Compliance principles
7. Mandatory compliance requirements (the control obligations)
8. Regulatory and standards alignment
9. Compliance obligations by role
10. The compliance lifecycle (obligation → evidence → assurance)
11. Compliance evidence requirements
12. Monitoring, measurement, and continuous compliance
13. Non-compliance: classification and consequences
14. Compliance exceptions and waivers
15. Attestation and certification
16. Third-party, vendor, and inherited-architecture compliance
17. Records, retention, and legal hold
18. Whistleblowing, escalation, and non-retaliation
19. Policy exceptions, review, and version control
20. Enforcement
21. Worked example — a compliance determination
22. Appendix A — control-obligation register (summary)
23. Appendix B — regulatory mapping matrix (illustrative)
24. Appendix C — compliance attestation template
25. Appendix D — glossary deltas

---

## 1. Purpose

This policy establishes the **binding compliance obligations** for architecture
governance across the enterprise. Its purpose is to ensure that:

- the governance controls defined across this skill are **not optional** — they
  are obligations with named owners, evidence requirements, and consequences for
  non-compliance;
- the organization can **demonstrate**, to internal leadership, auditors, and
  external regulators, that its architecture is governed in conformance with its
  own policies and with applicable external obligations;
- **non-compliance is detected, classified, escalated, and remediated** through a
  defined lifecycle rather than tolerated or hidden; and
- compliance is **continuous and evidenced**, not a periodic performance staged
  for an audit.

Governance without compliance obligations is advice; this policy is what makes the
governance system *binding*.

---

## 2. Policy statement (the binding commitment)

> **The organization SHALL govern its post-Documentation-Freeze architecture in
> full conformance with the controls defined in this skill and with all applicable
> regulatory and contractual obligations. Every change to a frozen baseline,
> every deviation from it, and every divergence of the running system from it
> SHALL be governed, recorded, and auditable. No architectural decision of
> significance SHALL be made, and no release SHALL ship, outside the governance
> controls. Non-compliance SHALL be treated as a risk to be managed — detected,
> classified, escalated, remediated, and evidenced — never as an outcome to be
> concealed.**

This commitment is unconditional. It is not suspended by delivery pressure,
seniority, deadline, or the assertion that "this once" is an exception — an
exception is itself a governed act (§14), not a bypass.

---

## 3. Definitions

Terms are used as defined in `references/15-glossary-and-taxonomy.md`. Key terms
for this policy:

- **Compliance** — the state of conforming to a binding obligation (a control in
  this skill, a policy, a regulation, or a contract), *demonstrable with evidence*.
- **Control obligation** — a mandatory governance control (§7) that in-scope
  parties MUST operate.
- **Compliance evidence** — the inspectable artifact that demonstrates a control
  obligation is met (§11), per the schema (`references/19`).
- **Non-compliance** — a state in which a control obligation is not met (§13);
  synonymous, for audit, with a control failure.
- **Attestation** — a formal, recorded statement by an accountable party that
  named obligations are met (§15).
- **Applicable obligation** — a control, policy, regulation, or contract term that
  applies to a given system by virtue of its domain, data, jurisdiction, or
  customer commitments (§8).
- **Compliance owner** — the accountable party for a control obligation in a given
  scope (§9), sourced from `references/04` (ownership) and `references/13` (roles).

---

## 4. Scope and applicability

### 4.1 In scope

This policy applies to:

- **All architecture that has passed Documentation Freeze** (i.e., every frozen
  baseline) and everything that happens to it thereafter — the full remit of this
  skill (`SKILL.md` §3).
- **All parties** who make, approve, implement, change, or deviate from
  architecture: domain architecture owners, the ARB, the Chief Architect, delivery
  teams, and any delegate acting under governance authority (§9).
- **All artifact types** defined in `references/19` — ADRs, register entries, ACRs,
  exceptions, waivers, debt items, drift findings, dependency entries, approval
  records, audit findings, and maturity assessments.
- **All environments** in which a frozen baseline is realized — the running system
  that the baseline describes, wherever it operates.

### 4.2 Out of scope

- **Pre-freeze architecture design and qualification** — owned by Architecture
  Review, not by this policy (`SKILL.md` §3).
- **The implementation of controls in code or tooling** — this policy sets the
  obligation; building the tool is a delivery-line activity governed elsewhere and
  never performed by this skill.
- **Regulatory compliance determinations that are legal opinions** — this policy
  requires *architecture* to be governed compliantly and to produce the evidence
  regulators need; it does not render legal interpretations, which are the remit of
  Legal/Compliance functions (§8.3).

### 4.3 Precedence

Where this policy conflicts with a lower-authority document (a workflow, a
checklist, a template), **this policy prevails**, and the conflict is itself a
finding to be remediated (`references/17`). Where this policy conflicts with a
higher external obligation (law, regulation, binding contract), **the external
obligation prevails** and this policy is amended to align (§19). Where it conflicts
with the master `policies/architecture-governance-policy.md`, the master policy
prevails.

---

## 5. Authority and ownership of this policy

- **Policy owner:** the Chief Architect (accountable), operating through the
  Architecture Review Board (ARB) (`references/00`, `references/13`).
- **Approval authority:** the ARB approves this policy; material changes are
  ratified per §19.
- **Mandate:** this policy derives its binding force from the governance operating
  model (`references/00`) and the master architecture-governance policy. It is
  itself a governed artifact — changes follow §19 and are recorded as an ADR about
  the governance system (`references/02`, `references/19` §13.4).
- **Interpretation:** questions of interpretation are resolved by the policy owner;
  disputes escalate via `policies/escalation-policy.md` /
  `workflows/escalation-and-dispute-resolution.md`.

---

## 6. Compliance principles

The mandatory requirements (§7) rest on these principles. Where a specific
requirement is silent, these principles govern.

1. **Compliance is demonstrable, not asserted.** A control is compliant only when
   its conformance can be shown with inspectable evidence (§11). "We comply" without
   evidence is non-compliance for audit purposes (`references/17` §8.2).
2. **Compliance is continuous, not episodic.** Obligations hold at all times, not
   only at audit or release. Point-in-time compliance staged for an inspection is a
   form of non-compliance (§12, `references/16` §12.1).
3. **The baseline is protected absolutely.** No frozen-baseline invariant,
   security/compliance control, or cross-domain contract is changed, deviated from,
   or allowed to drift outside the governance controls (the Q5 backstop,
   `references/18` §4).
4. **Least authority, no self-certification.** Compliance decisions are made by the
   lowest competent authority; no party certifies its own compliance as the sole
   authority (§9, `references/17` §2).
5. **Non-compliance is surfaced, never concealed.** Concealment is a graver breach
   than the underlying non-compliance itself (§13.4, §18).
6. **Proportionality.** Compliance rigor is proportionate to risk tier
   (`references/16` §14); Tier-1 systems carry the strictest obligations. Rigor is
   never *below* the mandatory floor, regardless of tier.
7. **Segregation of duties.** Those who operate a control, those who oversee it,
   and those who assure it are distinct (the three lines, `references/17` §3).

---

## 7. Mandatory compliance requirements (the control obligations)

Each requirement below is a **control obligation**. In-scope parties **MUST** meet
it. Each maps to a governance function and is auditable (`references/17`). Failure
to meet a control obligation is non-compliance of at least the severity stated.

### CO-1 — Baseline integrity (S1)
Every change to a frozen baseline **MUST** be made only through an approved ACR
(`references/05`), recorded as an ADR (`references/02`) and register entry
(`references/03`). Silent baseline changes are **PROHIBITED**. *Min non-compliance
severity: S1.*

### CO-2 — Decision recording (S1)
Every architecturally significant decision **MUST** be recorded as an ADR with a
mirroring Decision Register entry, before or at the point the decision takes
effect. Undocumented significant decisions are **PROHIBITED**. *S1.*

### CO-3 — Register integrity (S1)
The Decision Register **MUST** be the single authoritative record, complete and
traceable, with every entry linked to its ADR and owner (`references/03`,
`references/19` §11.16). *S1.*

### CO-4 — Ownership (S1)
Every architectural element **MUST** have a named, accountable owner
(`references/04`). Orphaned elements **MUST** be detected and assigned within the
defined SLA. *S1.*

### CO-5 — Change authority (S1)
Every governance decision **MUST** be ratified by the authority mandated for its
scope and severity (`references/00` §6, `references/18` Tree C). Decisions made
outside mandate, and self-approvals where prohibited, are **PROHIBITED**. *S1.*

### CO-6 — Deviation control (S1)
Every deliberate deviation from the baseline or a control **MUST** be a recorded,
time-boxed exception or waiver, approved by an independent authority
(`references/08`, `policies/exception-and-waiver-policy.md`). Open-ended or
undocumented deviations are **PROHIBITED**. *S1.*

### CO-7 — Drift control (S1)
The running system **MUST** be systematically compared to the frozen baseline;
confirmed divergence **MUST** be classified and dispositioned to remediate, waive,
or promote-to-change (`references/09`, `references/18` Tree F). Silent acceptance of
drift is **PROHIBITED**. *S1.*

### CO-8 — Release gate (S1)
No release **SHALL** ship without a recorded, evidence-based architecture approval
by the mandated authority (`references/11`). A release with any unresolved S1
**MUST NOT** be approved. *S1.*

### CO-9 — Sprint gate (S2)
Every sprint that touches the baseline, introduces a cross-domain dependency, or
creates an exception **MUST** pass an architecture gate with each such item
properly routed (`references/12`, `references/18` Tree H). *S2 (S1 if it conceals a
baseline change).*

### CO-10 — Cross-domain contracts (S2)
Every cross-domain dependency **MUST** be registered and governed by a current
contract; cyclic dependencies are **PROHIBITED** except under an explicit,
time-boxed waiver with a remediation roadmap (`references/10`, `references/18`
Tree I). *S2 (S1 if it breaches a contract).*

### CO-11 — Technical-debt visibility (S2)
Every accepted architectural compromise **MUST** be recorded in the debt ledger
with quantified interest/principal and an owner (`references/07`). Debt **MUST NOT**
be used to conceal an S1 baseline breach (`references/18` Tree J-QJ1). *S2.*

### CO-12 — Evidence and auditability (S1)
Every control obligation above **MUST** produce inspectable evidence per
`references/19` and retain it per §17. The governance trail **MUST** be
append-only, attributed, and tamper-evident (`references/17` §16). Records that
cannot be trusted **MUST** be treated as non-compliant. *S1.*

### CO-13 — Metric integrity (S1)
Governance KPIs (`references/14`) **MUST** be calculated correctly from primary
evidence and **MUST NOT** be gamed. A gamed or false metric is an S1 breach because
every downstream compliance and maturity judgment relies on it. *S1.*

### CO-14 — Segregation of duties (S1)
The parties operating, overseeing, and assuring a control **MUST** be distinct to
the degree required by the three-lines model (`references/17` §3). A control assured
solely by its operator is non-compliant. *S1.*

> **The mandatory floor.** CO-1 through CO-8, CO-12, CO-13, and CO-14 are **S1
> control obligations** — the load-bearing structure of compliance. No risk tier,
> deadline, or authority may lower them. They may only be *temporarily and
> explicitly* waived under §14, which is itself a governed, evidenced act.

---

## 8. Regulatory and standards alignment

### 8.1 The organization's obligations are inherited into architecture

Where a system is subject to an external obligation — a regulation, a standard, a
binding customer contract — that obligation's architecture-relevant controls
**become applicable control obligations** for that system (§4.1, §3 precedence).
Governance MUST ensure the architecture provides the controls the obligation
requires and the *evidence* the obligation's auditors will demand.

### 8.2 Mapping, not duplication

This policy does not restate external regulations. It **maps** governance controls
(§7) to the external obligations they satisfy (Appendix B), so that:

- a single governance control can evidence multiple external obligations, and
- a gap in a governance control immediately reveals which external obligations are
  exposed.

A governance non-compliance that is *also* an external-obligation breach is
**always at least S1**, regardless of its severity under §7 (`references/17` §19).

### 8.3 Division of responsibility with Legal/Compliance

- **This policy / the governance function** ensures the *architecture is governed
  compliantly* and *produces the required evidence*.
- **Legal/Compliance functions** own the *interpretation* of what external
  obligations require and *whether* a given control satisfies them.
- Governance **MUST NOT** render legal interpretations (§4.2); where an obligation's
  applicability or sufficiency is unclear, governance raises it to Legal/Compliance
  as a finding and awaits determination before certifying compliance.

### 8.4 Change in external obligation

When an external obligation changes, the policy owner **MUST** reassess the mapping
(Appendix B), identify affected control obligations, and drive any required
architecture change through the ACR process (`references/05`) — never by silent
adjustment. A new obligation that a frozen baseline cannot yet meet is a compliance
gap to be managed under §13/§14, not ignored.

---

## 9. Compliance obligations by role

Roles are as defined in `references/13`; ownership as in `references/04`. Each role
carries specific, non-delegable compliance accountabilities.

| Role | Compliance accountability |
| --- | --- |
| **Chief Architect** | Accountable for enterprise architecture compliance; owns this policy; final internal authority on S1 waivers and disputes; certifies enterprise compliance to leadership. |
| **Architecture Review Board (ARB)** | Approves S1 decisions, cross-domain changes, and waivers; adjudicates non-compliance escalations; owns the control-obligation register (Appendix A). |
| **Domain Architecture Owner** | Accountable for compliance within their domain; operates first-line controls; assigns/resolves orphaned elements; attests domain compliance (§15). |
| **Delivery teams** | MUST operate the controls in daily work — raise ACRs, request exceptions, route sprint items; MUST NOT change/deviate/drift outside the controls; surface non-compliance immediately. |
| **Governance function (2nd line)** | Designs and monitors controls; maintains the register, schema, and KPIs; detects non-compliance; drives remediation; MUST NOT assure its own controls. |
| **Governance audit (3rd line)** | Independently verifies compliance (`references/17`); MUST be independent of the controls it audits; reports non-compliance to the ARB/risk committee. |
| **Emergency delegate** | May make time-boxed provisional decisions when the proper authority is unavailable; MUST obtain retroactive ratification within the window or the decision auto-expires (`references/18` Tree C-QC5). |

**Non-delegation rule.** Accountability for compliance **MUST NOT** be delegated
away; specific tasks may be delegated, but the accountable owner remains answerable.

---

## 10. The compliance lifecycle (obligation → evidence → assurance)

Every control obligation flows through this lifecycle:

```
DEFINE ─ the obligation is stated (§7) and mapped (Appendix A/B)
   │
OPERATE ─ the accountable owner performs the control in daily work
   │
EVIDENCE ─ the control produces inspectable evidence per references/19 (§11)
   │
MONITOR ─ the 2nd line measures conformance continuously (§12)
   │
ASSURE ─ the 3rd line independently verifies (references/17)
   │
ATTEST ─ the accountable owner formally states conformance (§15)
   │
REMEDIATE ─ any non-compliance is classified, escalated, fixed, verified (§13)
   │
REVIEW ─ the obligation and its mapping are periodically reassessed (§19)
```

An obligation that is defined but not operated, operated but not evidenced, or
evidenced but not assured is **not compliant** — each stage is necessary.

---

## 11. Compliance evidence requirements

### 11.1 Evidence is mandatory

For every control obligation (§7), the accountable owner **MUST** be able to produce
evidence that it is met. The evidence:

- **MUST** conform to the governance metadata schema (`references/19`) — the correct
  artifact type, with required fields, valid links, and provenance;
- **MUST** be inspectable, recent (within the obligation's freshness window), and
  representative (not cherry-picked) — the evidence-reliability standard of
  `references/17` §8;
- **MUST** be retained per §17 and recoverable throughout its retention period.

### 11.2 Absence of evidence

Where evidence cannot be produced, the control obligation is treated as **not met**
(non-compliant), regardless of assertions that the control "is really being done."
This mirrors the audit principle that internally-asserted-but-unevidenced controls
carry the lowest reliability (`references/17` §8.2) and the schema rule that a
required-but-unknown value makes an artifact invalid (`references/19` §3.3).

### 11.3 Evidence integrity

Evidence **MUST** be drawn from the append-only, attributed, tamper-evident trail
(CO-12, `references/17` §16). Evidence that could have been silently altered is not
reliable evidence and does not demonstrate compliance.

---

## 12. Monitoring, measurement, and continuous compliance

### 12.1 Continuous, not episodic

Compliance **MUST** be monitored continuously (§6.2). The governance function
(2nd line) operates monitoring — automated where feasible (`references/17` §14) —
over: register completeness, exception aging/expiry, authority conformance,
ownership coverage, drift, and metric integrity.

### 12.2 KPIs and thresholds

Compliance is measured through the governance KPIs (`references/14`). Each
S1 control obligation **MUST** have at least one KPI with a defined threshold; a
threshold breach **MUST** trigger a defined response (investigate → classify →
escalate/remediate). Watching a threshold without acting on a breach is itself a
compliance failure.

### 12.3 Monitoring is a control, assurance is independent

Second-line monitoring is a *control*, not assurance; it lacks independence
(`references/17` §14.2). Independent assurance (3rd line) MUST separately verify
that the monitoring itself works — the organization MUST NOT outsource its
compliance assurance to the thing being monitored.

---

## 13. Non-compliance: classification and consequences

### 13.1 Classification

Every instance of non-compliance is classified by severity (`references/15`,
`references/18` Tree L), floored by the control obligation's stated minimum (§7):

| Severity | Meaning for compliance | Response |
| --- | --- | --- |
| **S1 — Critical** | A load-bearing obligation is unmet; a baseline/security/cross-domain control is exposed; records are untrustworthy; or an external obligation is breached. | Immediate escalation to ARB; release blocked; remediation on the shortest cycle; leadership notified. |
| **S2 — Major** | A significant, domain-contained obligation is unreliably met. | Near-term remediation with an authority-approved plan; interim risk formally accepted (§14). |
| **S3 — Minor** | An obligation is met with recurring low-impact gaps. | Scheduled remediation. |
| **S4 — Informational** | An isolated slip with no pattern. | Tracked for trends. |

### 13.2 Consequences are proportionate and control-focused

Consequences of non-compliance target the **control and its remediation**, not the
punishment of individuals (§18, `references/16` §12.7, `references/17` §11.5). The
standard consequence chain:

1. The non-compliance is **recorded** as an audit/compliance finding
   (`references/19` §8.11).
2. It is **escalated** to the mandated authority (§9, `policies/escalation-policy.md`).
3. A **remediation** with owner and date is agreed; interim risk is formally
   accepted via §14 where the gap cannot close immediately.
4. Remediation is tracked to **independently verified closure** (`references/17`
   §12.5) — never closed on assertion.
5. Repeated or systemic non-compliance of the same control triggers a **root-cause
   review** and feeds architecture evolution / operating-model redesign
   (`references/06`, `references/16` §17).

### 13.3 Blocking consequences

Certain non-compliances **MUST** block downstream action, non-negotiably:

- An **unresolved S1** blocks the release gate (CO-8, `references/18` Tree G-QG1).
- A **self-approval** or **out-of-mandate decision** is void until ratified by the
  correct authority (CO-5).
- A **silently accepted drift** or **undocumented baseline change** is treated as an
  active S1 breach until governed (CO-1, CO-7).

### 13.4 Concealment is the graver breach

**Concealing** non-compliance — falsifying evidence, back-dating records, gaming a
metric, or failing to surface a known breach — is treated as a **more serious
breach than the underlying non-compliance**, because it corrupts the evidence base
on which all governance depends (§6.5, §18). Concealment involving S1 obligations,
records integrity (CO-12), or metric integrity (CO-13) is escalated to the Chief
Architect and leadership.

---

## 14. Compliance exceptions and waivers

### 14.1 Non-compliance may be temporarily and explicitly waived — never bypassed

Where a control obligation genuinely cannot be met immediately, the gap **MUST** be
managed as a governed exception or waiver (`references/08`,
`policies/exception-and-waiver-policy.md`), **not** as an undocumented bypass. A
waiver:

- **MUST** be time-boxed with an absolute expiry and a remediation plan
  (`references/19` §8.4–8.5);
- **MUST** be granted by an independent authority (never self-approved) at the level
  required by the obligation's severity — S1 obligations require ARB or higher
  (`references/18` Tree E);
- **MUST** state the interim risk and who accepts it;
- **MUST** be recorded and auditable, and **MUST** `COVER` the specific
  non-compliance (`references/19` §7.2).

### 14.2 What may never be waived

The following **MUST NOT** be waived under any circumstances:

- The requirement to **record and make auditable** (CO-12) — you may waive meeting a
  control, but never the requirement to *document that you did not*.
- **Metric integrity** (CO-13) and **evidence integrity** — a waiver cannot sanction
  falsification.
- **Segregation of duties for the waiver itself** (CO-14) — a party cannot waive
  its own non-compliance.
- Any obligation whose external regulator/contract **prohibits** waiver.

### 14.3 The permanent-temporary guard

A waiver of a control obligation that is **renewed beyond the defined threshold**
MUST be stopped and the non-compliance **promoted** — either remediated or resolved
by a deliberate architecture change (`references/18` Tree E-QE5,
`references/16` §12.5). Perpetual waivers are structural non-compliance wearing a
waiver.

---

## 15. Attestation and certification

### 15.1 Periodic attestation

On the defined cadence (§19), each accountable owner (§9) **MUST** formally attest,
in a recorded artifact, that the control obligations within their scope are met, or
identify precisely which are not and their waiver/remediation status. Attestation:

- **MUST** be evidence-backed (§11) — an attestation not supported by inspectable
  evidence is itself a compliance failure and, if knowingly false, a concealment
  breach (§13.4);
- **MUST** name any exceptions/waivers in force and any open non-compliance;
- **MUST** be made by the accountable owner personally — attestation is
  non-delegable (§9).

### 15.2 Enterprise certification

The Chief Architect, on the basis of domain attestations, independent assurance
(`references/17`), and the maturity picture (`references/16`), certifies enterprise
architecture compliance to leadership and, where required, provides the evidence
external auditors and regulators request (§16, `references/17` §19).

### 15.3 Qualified attestation is honest attestation

An attestation that *correctly* reports non-compliance with a remediation plan is
**compliant behavior** (surfacing, §6.5). A clean attestation that conceals a known
gap is the opposite. The policy rewards honesty: the goal is a *true* compliance
picture, not a flattering one.

---

## 16. Third-party, vendor, and inherited-architecture compliance

- **Inherited baselines.** Architecture acquired via merger, acquisition, or vendor
  delivery **MUST** be brought under governance — assessed for compliance, gaps
  recorded, and non-compliance managed under §13/§14 — within a defined onboarding
  window. It is **PROHIBITED** to exempt inherited architecture from this policy
  because "it came from outside."
- **Vendor/third-party controls.** Where a control obligation is met by a third
  party, the accountable owner **MUST** obtain evidence of the third party's control
  operation sufficient to attest (§15); the obligation is not discharged by the mere
  existence of a contract.
- **Shared responsibility.** For externally-operated platforms, the boundary of who
  operates which control **MUST** be explicit and governed as a cross-domain
  contract (CO-10); ambiguity in the boundary is itself a compliance gap.

---

## 17. Records, retention, and legal hold

- **Retention.** All compliance evidence and governance artifacts **MUST** be
  retained for the period set by risk tier and external obligation
  (`references/17` §16.1), and **MUST** remain recoverable throughout. Terminal-state
  artifacts are retained, never purged (`references/19` §12.2).
- **Immutability.** Records **MUST** be append-only, attributed, and tamper-evident
  (CO-12). Silent alteration is prohibited; corrections happen by
  supersession/amendment (`references/19` §10.3).
- **Legal hold.** When a legal hold applies, affected records **MUST NOT** be
  altered, transitioned to terminal, or allowed to age out of retention, overriding
  normal retention schedules, until the hold is lifted by the authorized function.
- **Classification and access.** Records carry a data classification
  (`references/19` §14); access is need-to-know; audit access is broad but read-only
  (`references/17` §2.3).

---

## 18. Whistleblowing, escalation, and non-retaliation

- **Duty to report.** Every in-scope party has a **duty to surface** known or
  suspected non-compliance, especially S1 and concealment (§6.5, §13.4). Silence in
  the face of a known breach is itself a compliance failure.
- **Escalation paths.** Non-compliance is escalated through the defined path
  (`policies/escalation-policy.md`); where the normal path is compromised (e.g., the
  non-compliance involves the escalation authority), the reporter escalates to the
  next independent authority up to and including the Chief Architect and leadership.
- **Non-retaliation.** Retaliation against a party for surfacing non-compliance in
  good faith is **PROHIBITED** and is itself a serious breach. The policy depends on
  transparency; punishing transparency destroys the evidence base
  (`references/16` §12.7, `references/17` §11.5).
- **Good-faith protection.** A good-faith report that proves unfounded is not a
  breach; the protection is for honesty, not for correctness.

---

## 19. Policy exceptions, review, and version control

- **Exceptions to this policy** are themselves governed: they follow §14 and
  `policies/exception-and-waiver-policy.md`, require the authority mandated by the
  affected obligation's severity, and MUST be time-boxed and recorded. The
  un-waivable list (§14.2) constrains what any policy exception may reach.
- **Review cadence.** This policy **MUST** be reviewed at least annually, and
  additionally on any material change in external obligation (§8.4), operating model
  (`references/00`), or a governance failure with a policy root cause
  (`references/17`).
- **Version control.** This policy is versioned; every compliance determination
  cites the policy version in force at the time (`references/17` §7.3,
  `references/19` §13). Changes are ARB-approved and recorded as an ADR about the
  governance system (§5).
- **Change discipline.** A change to this policy changes binding obligations
  enterprise-wide; it therefore follows full governance change discipline —
  proposed, reviewed, impact-assessed against the regulatory mapping (Appendix B),
  approved, versioned, and communicated.

---

## 20. Enforcement

- **This policy is enforced through the governance controls themselves**, not
  through side-effectful action by the Architecture Governance skill. The skill
  *detects and reports* non-compliance, *routes* it to the mandated authority
  (`references/18`), and *records* findings/waivers/obligations on explicit request
  (`references/19`). It does **not** block pipelines, revoke access, or take any
  operational enforcement action — those are delivery-line/operational functions
  acting on the governance decision.
- **The mandated authorities enforce** by exercising their decision rights: the ARB
  blocks non-compliant releases, voids out-of-mandate decisions, and adjudicates
  breaches (§9, §13.3).
- **Independent assurance verifies** enforcement is real (`references/17`): an
  obligation that is stated but never enforced is a compliance theatre finding
  (`references/16` §12).
- **No code, ever.** Where enforcement or remediation requires code, tooling, or
  configuration, this skill emits a **directive** to the delivery line citing the
  governing obligation and stops (`SKILL.md` §2, §8). It never implements the
  enforcement.

---

## 21. Worked example — a compliance determination

> *Illustrative. A release is presented for approval; a compliance determination is
> requested.*

**Request.** "Approve the Identity release; encryption-at-rest was deferred this
quarter under a plan."

**Determination (advisory; recorded only on request):**

1. **Route.** Master triage → release approval (`references/18` Tree G); Q5 backstop
   fires — encryption-at-rest is a **security/compliance control**, so **S1**, and
   this is also an **external-obligation** control (Appendix B maps it to a
   regulatory requirement) → non-compliance here is at least S1 (§8.2).
2. **Obligation check.** CO-6 (deviation control) and CO-8 (release gate) apply. Is
   the deferral a *governed waiver* or an *undocumented bypass*?
   - If **no recorded, time-boxed, ARB-granted waiver** covering it → **CO-6
     breach, S1**; the release **MUST NOT** be approved (CO-8, §13.3); the situation
     is an active S1 non-compliance until governed.
   - If a **valid waiver** exists (`WVR-*`, S1, time-boxed, ARB, `requester ≠
     authority`, `COVERS` the control gap, remediation plan) → the *deviation* is
     compliant; proceed to step 3.
3. **Un-waivable check (§14.2).** Confirm the regulator/contract does **not prohibit
   waiver** of this control. If it does, **no waiver is valid**, the gap **MUST** be
   remediated before release, and Legal/Compliance is engaged (§8.3). Assume waiver
   is permitted.
4. **Release decision.** With a valid waiver and its interim risk accepted, and no
   *other* open S1, the gate may be **CONDITIONAL_GO** — conditions: monitor,
   remediate by the waiver's expiry, do not renew past threshold (§14.3). Recorded
   in a `REL-*` record with `open_s1_count = 0` (the S1 is *covered*, not *open*),
   linked to the waiver.
5. **Attestation impact.** The Identity owner's next attestation (§15) **MUST**
   disclose this waiver and its status — a clean attestation hiding it would be a
   concealment breach (§13.4).

**Outcome.** Not a simple "approve." The determination distinguishes a *governed
deviation* (compliant) from an *undocumented bypass* (S1 non-compliance), enforces
the un-waivable check for the external obligation, and produces an evidenced,
conditional decision — with no code written and nothing recorded unless explicitly
requested.

---

## 22. Appendix A — control-obligation register (summary)

| ID | Control obligation | Function (ref) | Min severity | KPI (references/14) | Waivable? |
| --- | --- | --- | --- | --- | --- |
| CO-1 | Baseline integrity (change only via ACR) | 05/02/03 | S1 | emergency-change rate; unrecorded-change count | No* |
| CO-2 | Decision recording (ADR + DRE) | 02/03 | S1 | ADR coverage | No* |
| CO-3 | Register integrity | 03 | S1 | orphan rate; traceability coverage | No* |
| CO-4 | Ownership (no orphans) | 04 | S1 | ownership coverage; orphan age | No* |
| CO-5 | Change authority (no self-approval) | 00/18 | S1 | self-approval count; out-of-mandate count | No |
| CO-6 | Deviation control (time-boxed waivers) | 08 | S1 | exception aging; renewal count | Temp only |
| CO-7 | Drift control (no silent accept) | 09/18 | S1 | drift rate; undispositioned-drift count | No* |
| CO-8 | Release gate (no S1 ships) | 11 | S1 | gate pass/fail; post-release incidents | No |
| CO-9 | Sprint gate | 12 | S2 | sprint gate coverage | Temp only |
| CO-10 | Cross-domain contracts (no cycles) | 10/18 | S2 | dependency coverage; cycle count | Temp only |
| CO-11 | Technical-debt visibility | 07 | S2 | debt coverage; interest trend | Temp only |
| CO-12 | Evidence & auditability | 17/19 | S1 | trail integrity; evidence coverage | Never |
| CO-13 | Metric integrity | 14 | S1 | metric re-performance variance | Never |
| CO-14 | Segregation of duties | 17 | S1 | SoD violation count | Never |

\* *"No*"* = the control itself may be temporarily waived under §14 only for the
specific meeting of the control, but the recording/auditability of that waiver
(CO-12) is **never** waivable. "Never" = not waivable at all (§14.2).

---

## 23. Appendix B — regulatory mapping matrix (illustrative)

> Illustrative and non-exhaustive. The live matrix is owned by the policy owner with
> Legal/Compliance (§8.3) and is reassessed on any obligation change (§8.4).

| External obligation (class) | Architecture-relevant requirement | Satisfying control obligation(s) | Evidence artifact |
| --- | --- | --- | --- |
| Data-protection regulation | Data-at-rest protection; data-flow control | CO-6, CO-8, CO-10 | ADR/ACR + waiver + dependency entry |
| Financial-services control regime | Change control; segregation of duties; auditability | CO-1, CO-5, CO-12, CO-14 | ACR + authority record + immutable trail |
| Security standard (e.g., ISMS) | Control operation + evidence; risk-based exceptions | CO-6, CO-7, CO-12 | drift findings + waivers + evidence pack |
| Contractual SLA / customer commitment | Availability/blast-radius control at domain seams | CO-10 | cross-domain contract + blast-radius analysis |
| Records/e-discovery obligation | Retention, immutability, legal hold | CO-12, §17 | retention config + hold records |

A gap in any listed control obligation immediately flags the exposed external
obligations (§8.2); such a gap is **always at least S1**.

---

## 24. Appendix C — compliance attestation template

```
ATTESTATION — Architecture Governance Compliance
SCOPE (domain/portfolio): ___________________  RISK TIER: ____
ATTESTING OWNER (accountable, non-delegable §15.1): ________________________
PERIOD COVERED: ____________________  POLICY VERSION: ______  DATE: ________

For each control obligation in scope, state status and evidence:
CO-#   STATUS [MET | WAIVED | NOT MET]   EVIDENCE REF (references/19)   NOTES
CO-1   [ ]                                ____________________          ______
CO-2   [ ]                                ____________________          ______
...    ...                                ...                           ...
CO-14  [ ]                                ____________________          ______

WAIVERS IN FORCE (id, expiry, authority, covers):
  __________________________________________________________________________
OPEN NON-COMPLIANCE (id, severity, remediation owner, target, interim-risk
acceptor):
  __________________________________________________________________________

DECLARATION: I attest, on the basis of inspectable evidence, that the above is a
true and complete statement of compliance for my scope, and that all known
non-compliance and waivers are disclosed. I understand that a knowingly false or
concealing attestation is a concealment breach (§13.4).

SIGNED (actor-ref): __________________   COUNTERSIGNED (2nd line): __________
INDEPENDENT ASSURANCE REF (references/17, if any): _________________________
```

---

## 25. Appendix D — glossary deltas

Terms introduced by this policy (add to
`references/15-glossary-and-taxonomy.md`):

- **Control obligation** — a mandatory governance control (CO-1..CO-14) that
  in-scope parties MUST operate and evidence (§7).
- **Compliance (demonstrable)** — conformance to a binding obligation that can be
  shown with inspectable evidence; assertion without evidence is non-compliance
  (§6.1, §11.2).
- **Continuous compliance** — the requirement that obligations hold at all times,
  not only at audit/release (§6.2, §12).
- **Mandatory floor** — the set of S1 control obligations that no tier, deadline, or
  authority may lower (§7).
- **Applicable obligation** — an external control/regulation/contract that becomes a
  control obligation for a system by virtue of its data, domain, or jurisdiction
  (§8.1).
- **Concealment breach** — falsifying, back-dating, gaming, or failing to surface
  non-compliance; graver than the underlying non-compliance (§13.4).
- **Attestation (qualified vs. false)** — an evidence-backed statement of
  compliance; qualified/honest attestation of a gap is compliant behavior, a clean
  attestation hiding a gap is a concealment breach (§15).
- **Un-waivable obligation** — an obligation (CO-12, CO-13, CO-14, and
  regulator-prohibited controls) that MUST NOT be waived under any circumstances
  (§14.2).
- **Mandatory floor waiver guard** — the rule that even a permitted control waiver
  never waives the requirement to record and audit it (§14.1–14.2).
- **Non-retaliation** — the prohibition on punishing good-faith surfacing of
  non-compliance (§18).

---

*Architecture Governance Compliance Policy — the binding compliance layer. It turns
governance controls into mandatory, evidenced obligations with named owners and real
consequences; it demands that non-compliance be surfaced, governed, and remediated
rather than concealed; and — being read-only — it judges, routes, and records
compliance, enforces only through the mandated authorities, and never writes code.*
