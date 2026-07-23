# Technical Debt Register

Version: 1.0.0
Status: Draft

## Purpose

A reusable worksheet for recording individual technical debt items as
implementation data. It defines no categories, severity model, lifecycle, or
governance rules of its own.

- **Category** and **Severity** values are drawn from
  [`.claude/skills/Architecture Review/severity-model.md.txt`](../../.claude/skills/Architecture%20Review/severity-model.md.txt)
  (see its "Technical Debt Mapping" section) — do not invent new categories
  or severity levels here.
- **Governance context**: technical debt is tracked as a metric in
  `.claude/skills/ssot/governance-model.md.txt` and as part of Continuous
  Improvement in `.claude/skills/ssot/ssot-principles.md.txt` — this register
  is the implementation-data companion to those references, not a
  replacement for them.
- This worksheet is not itself a governance artifact. It's a place to record
  debt items consistently; how they get prioritized, approved, or resolved
  follows the existing Production processes.

## How to use

1. Add one row per debt item as it's identified.
2. Use `Category` and `Severity` values already defined in
   `severity-model.md.txt` — don't add new ones here.
3. Link back to the ADR or issue/ticket that tracks the decision or work,
   where one exists.
4. Update `Status` and `Target Release` as items move through resolution.

---

## Debt Register

| Debt ID | Title | Description | Component | Category | Severity | Business Impact | Engineering Impact | Estimated Effort | Owner | Status | Target Release | ADR Reference | Issue/Ticket Reference | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | | |

---

*Category and Severity definitions: see
[`severity-model.md.txt`](../../.claude/skills/Architecture%20Review/severity-model.md.txt).
Governance and prioritization process: see
[`governance-model.md.txt`](../../.claude/skills/ssot/governance-model.md.txt)
and [`ssot-principles.md.txt`](../../.claude/skills/ssot/ssot-principles.md.txt).*
