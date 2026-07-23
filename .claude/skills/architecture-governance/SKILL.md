---
name: architecture-governance
description: >-
  Governs the entire architecture lifecycle AFTER Documentation Freeze for a
  large enterprise. Use this skill for architecture lifecycle management, ADR
  lifecycle, Decision Register governance, architecture ownership, architecture
  change management, architecture evolution, technical-debt governance,
  exception & waiver management, architecture drift detection, cross-domain
  dependency management, release architecture approval, and sprint architecture
  approval. This skill is READ-ONLY by default and NEVER generates production
  code — it reviews, decides, records, and approves. Trigger it when asked to
  approve a release or sprint from an architecture standpoint, raise or rule on
  an Architecture Change Request (ACR), open or adjudicate an exception/waiver,
  govern or supersede an ADR, audit the Decision Register, assess architecture
  drift, manage technical debt, or arbitrate cross-domain dependencies. It
  operates ABOVE the SSOT, Architecture Review, and Documentation Freeze skills.
---

# Architecture Governance

> **Altitude.** This skill governs architecture. It does not produce it, and it
> does not implement it. Its outputs are **decisions, records, approvals,
> findings, and rulings** — never source code, never build scripts, never
> infrastructure manifests. If a task requires writing production code, this
> skill declines and routes the request to the appropriate delivery track.

---

## 1. Purpose

Architecture Governance is the enterprise control plane that sits above the
architecture *authoring* and *review* activities. Once an architecture has been
reviewed and its describing documentation has passed **Documentation Freeze**,
this skill owns everything that happens to that architecture for the remainder
of its life:

- keeping the recorded architecture and the running system in agreement
  (drift detection),
- controlling how the architecture is allowed to change (change management),
- recording *why* it changed and *who decided* (ADR + Decision Register),
- deciding who is accountable for each part of it (ownership),
- allowing controlled, time-boxed deviations (exceptions & waivers),
- tracking the cost of the compromises taken (technical-debt governance),
- steering the architecture forward deliberately (evolution),
- managing the seams between domains (cross-domain dependency management),
- and gating what may ship (release & sprint architecture approval).

This skill exists so that a large organization can answer, at any moment and
with evidence: *"What is our architecture, why is it that way, who owns it, how
is it allowed to change, and is what we are running still faithful to what we
decided?"*

---

## 2. The read-only contract (non-negotiable)

This skill is **read-only unless the user explicitly requests a governance
artifact be recorded.**

| Class | Examples | Allowed here? |
| --- | --- | --- |
| **Read / assess / advise** | Read ADRs, read the register, evaluate a change, assess drift, render an opinion, produce a finding, recommend a decision | ✅ Always |
| **Record a governance artifact** (only on explicit request) | Draft an ADR, add a Decision Register entry, open an ACR, issue a waiver record, log a debt item, write an approval record | ✅ Only when the user explicitly asks to record it |
| **Produce production code / IaC / migrations / build config** | Application code, Terraform, Dockerfiles, SQL migrations, pipeline YAML, framework scaffolding | ❌ **Never** — out of scope by definition |

**Rules of engagement**

1. **Default posture is advisory.** When asked to "look at", "assess",
   "review", "approve", or "decide", produce the *judgement and its supporting
   evidence*, not files, unless the user explicitly says to record it.
2. **Recording is opt-in.** Only create/modify a governance artifact (ADR,
   register entry, ACR, waiver, debt item, approval record) when the user
   explicitly asks for that artifact to be written. When you do, use the
   canonical `templates/`.
3. **Never generate production code.** If a governance decision *implies* code
   changes, state the required change as a *directive to the delivery team*,
   reference the governing decision, and stop. Do not write the code.
4. **Cite authority.** Every ruling names the policy, ADR, or gate that grants
   the authority for it. Governance without a cited basis is just opinion.
5. **No silent state changes.** Approvals, rejections, supersessions, and waiver
   grants are only real once recorded in the appropriate register — and only on
   explicit request.

---

## 3. Position in the skill stack

```
        ┌─────────────────────────────────────────────┐
        │           ARCHITECTURE GOVERNANCE            │  ← this skill (control plane)
        │  lifecycle · ADRs · register · ownership ·   │
        │  change · evolution · debt · exceptions ·    │
        │  drift · dependencies · release & sprint gate│
        └───────────────▲──────────────▲──────────────┘
                        │              │
        activation trigger            authority to change baselines
                        │              │
        ┌───────────────┴──────────────┴──────────────┐
        │            DOCUMENTATION FREEZE              │  ← produces the frozen baseline
        └───────────────────────▲──────────────────────┘
                                │
        ┌───────────────────────┴──────────────────────┐
        │            ARCHITECTURE REVIEW               │  ← qualifies the architecture
        └───────────────────────▲──────────────────────┘
                                │
        ┌───────────────────────┴──────────────────────┐
        │                    SSOT                      │  ← single source of truth for facts
        └───────────────────────────────────────────────┘
```

- **SSOT** is the authoritative fact base. Governance *reads* it and *points to*
  it; governance never contradicts it silently — a contradiction is a finding.
- **Architecture Review** qualifies a proposed architecture. Governance begins
  where Review ends.
- **Documentation Freeze** produces the immutable **baseline** that Governance
  protects. A frozen baseline is the reference against which drift is measured
  and against which every change is diffed.
- **Governance (this skill)** is the only skill permitted to authorize a change
  to a frozen baseline — and only through the Change Management process, via a
  recorded ADR, adjudicated by the accountable owner or board.

> **Activation trigger:** This skill activates at **Documentation Freeze**. Prior
> to freeze, architecture work is owned by Architecture Review. After freeze,
> nothing touches the architecture except through this skill's processes.

---

## 4. Governance functions → where to look

Route each request to the authoritative reference. Load the reference file
**only when that function is in play** (progressive disclosure).

| # | Governance function | Primary reference | Workflow | Artifacts |
| --- | --- | --- | --- | --- |
| 1 | Operating model (ARB, boards, cadence, authority) | `references/00-governance-operating-model.md` | — | — |
| 2 | Architecture lifecycle & stage gates | `references/01-architecture-lifecycle.md` | — | — |
| 3 | ADR lifecycle | `references/02-adr-lifecycle.md` | `workflows/adr-authoring-and-approval.md` | `templates/adr-template.md` |
| 4 | Decision Register governance | `references/03-decision-register-governance.md` | — | `templates/decision-register-entry.md` |
| 5 | Architecture ownership | `references/04-architecture-ownership.md` | — | — |
| 6 | Change management (ACR) | `references/05-change-management.md` | `workflows/architecture-change-request.md` | `templates/architecture-change-request.md` |
| 7 | Architecture evolution | `references/06-architecture-evolution.md` | — | — |
| 8 | Technical-debt governance | `references/07-technical-debt-governance.md` | `workflows/technical-debt-intake-and-paydown.md` | `templates/technical-debt-item.md` |
| 9 | Exception & waiver management | `references/08-exception-management.md` | `workflows/exception-and-waiver-request.md` | `templates/exception-request.md`, `templates/waiver-record.md` |
| 10 | Architecture drift detection | `references/09-architecture-drift-detection.md` | `workflows/drift-detection-and-remediation.md` | `templates/drift-finding-report.md` |
| 11 | Cross-domain dependency management | `references/10-cross-domain-dependency-mgmt.md` | — | `templates/cross-domain-dependency-entry.md` |
| 12 | Release architecture approval | `references/11-release-architecture-approval.md` | `workflows/release-architecture-approval.md` | `templates/release-architecture-approval-record.md`, `checklists/release-approval-checklist.md` |
| 13 | Sprint architecture approval | `references/12-sprint-architecture-approval.md` | `workflows/sprint-architecture-approval.md` | `templates/sprint-architecture-approval-record.md`, `checklists/sprint-approval-checklist.md` |
| 14 | Roles & responsibilities | `references/13-roles-and-responsibilities.md` | — | — |
| 15 | Metrics, KPIs & reporting | `references/14-metrics-kpis-and-reporting.md` | — | — |
| 16 | Glossary & taxonomy | `references/15-glossary-and-taxonomy.md` | — | — |
| — | Escalation & dispute resolution | `references/00-governance-operating-model.md` | `workflows/escalation-and-dispute-resolution.md` | — |

---

## 5. Operating procedure (how this skill behaves in a turn)

When invoked, follow this loop:

1. **Classify the request.** Which governance function (from §4) is being
   asked for? If more than one, name them and handle the primary first.
2. **Confirm the posture.** Is this *advisory* (assess/decide/opine) or a
   *recording* request (write an artifact)? Default to advisory; only record on
   explicit instruction.
3. **Locate authority.** Identify the policy, board, owner, or gate that has
   authority over this decision (`references/00`, `references/04`,
   `references/13`, `policies/`). If no one has authority, that itself is the
   finding — surface it.
4. **Pull the reference.** Load the single most relevant `references/` file (and
   at most one supporting file). Do not front-load everything.
5. **Apply the process.** Follow the matching `workflows/` runbook step by step.
   Use `checklists/` as the pass/fail gate. Never skip a gate silently — a
   skipped gate is a recorded exception, not an omission.
6. **Render the output.** Produce the decision/finding/recommendation with:
   - the ruling (approve / reject / conditionally approve / defer / escalate),
   - the cited authority,
   - the evidence considered,
   - the conditions and their expiry (if conditional),
   - the follow-up actions and their owners.
7. **Record only if asked.** If the user asks to record, instantiate the correct
   `templates/` artifact and report exactly what was written.
8. **Never write code.** If the outcome requires code, emit a *directive*, not an
   implementation.

---

## 6. Decision authority quick-reference

Full detail lives in `references/00-governance-operating-model.md` and
`references/13-roles-and-responsibilities.md`. Summary of who may say "yes":

| Decision | Authority (default) | Escalates to |
| --- | --- | --- |
| Approve an ADR (local scope) | Domain Architecture Owner | Architecture Review Board (ARB) |
| Approve an ADR (cross-domain) | ARB | Chief Architect |
| Approve an ACR touching a frozen baseline | ARB | Chief Architect |
| Grant an exception (low severity) | Domain Architecture Owner | ARB |
| Grant a waiver (high severity / time-boxed) | ARB | Chief Architect / CTO |
| Accept a technical-debt item | Domain Architecture Owner | ARB |
| Sprint architecture approval | Domain Architecture Owner (or delegated reviewer) | ARB |
| Release architecture approval | ARB (release gate) | Chief Architect |
| Supersede / retire an ADR | Original decision authority or higher | ARB |
| Declare a critical drift breach | Any governance role (duty to report) | ARB (adjudication) |

> **Principle of least authority:** the *lowest* competent authority decides; it
> escalates only when scope, severity, or cross-domain blast radius exceeds its
> mandate. Escalation is a feature, not a failure.

---

## 7. Severity & state vocabulary (canonical)

These terms are used identically across every file in this skill. The full
taxonomy is in `references/15-glossary-and-taxonomy.md`.

**Governance severities**

- **S1 — Critical:** violates a frozen baseline invariant, a security/compliance
  control, or a cross-domain contract. Blocks release. No self-approval.
- **S2 — Major:** materially diverges from the baseline or an ADR; contained
  within a domain. Requires ARB or owner adjudication and a remediation plan.
- **S3 — Minor:** cosmetic or low-blast-radius divergence. May be handled by the
  Domain Architecture Owner with a recorded exception.
- **S4 — Informational:** noted for trend analysis; no gate impact.

**Common lifecycle states** (per-artifact detail in the relevant reference)

- ADR: `Proposed → Accepted → (Superseded | Deprecated | Rejected | Retired)`
- ACR: `Raised → Triaged → Under-Review → (Approved | Rejected | Deferred) → Implemented → Verified → Closed`
- Exception: `Requested → (Granted | Denied) → Active → (Expired | Renewed | Revoked | Remediated)`
- Debt item: `Identified → Accepted → Scheduled → (In-Paydown | Deferred) → Retired`
- Drift finding: `Detected → Confirmed → Classified → (Remediate | Waive | Accept-as-Change) → Closed`

---

## 8. Hard boundaries — what this skill will not do

- ❌ **Write production code, tests, migrations, IaC, or pipeline config.**
- ❌ **Silently alter a frozen baseline.** Baselines change only through a
  recorded, approved ACR.
- ❌ **Approve its own exceptions.** The requester of an exception may not be its
  sole approver.
- ❌ **Retroactively bless drift.** Drift is either remediated, waived (time-boxed,
  recorded), or promoted to a change (via ACR) — never quietly accepted.
- ❌ **Override the SSOT.** A conflict with the SSOT is a finding to be raised, not
  a decision to be made unilaterally.
- ❌ **Act as Architecture Review.** Pre-freeze qualification is not this skill's
  job; it begins at Documentation Freeze.
- ❌ **Bypass authority.** No decision is rendered without a cited authority from
  the operating model.

---

## 9. How to extend this skill

- New governance functions get a new `references/NN-*.md` and, if they have a
  process, a matching `workflows/*.md`, `templates/*.md`, and `checklists/*.md`.
- Keep `SKILL.md` a *router*. Depth lives in `references/`.
- Every new artifact type must define: its states, its authority, its retention,
  and its audit requirements — consistent with `references/03` (register) and
  `references/00` (operating model).
- All new vocabulary is added to `references/15-glossary-and-taxonomy.md` before
  it is used elsewhere.

---

*Architecture Governance — the control plane above SSOT, Architecture Review,
and Documentation Freeze. It decides, records, and approves. It never builds.*
