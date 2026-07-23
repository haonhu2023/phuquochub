# Feature Flag Register

Version: 1.0.0
Status: Draft

## Purpose

A reusable worksheet for recording feature flags as implementation
metadata. It defines no deployment, rollback, incident-response, release, or
operational procedures of its own.

- **Deployment and release process**: see
  [`.claude/skills/ssot/deployment-policy.md.txt`](../../.claude/skills/ssot/deployment-policy.md.txt)
  (Production) — feature flags are one of its listed deployment strategies;
  this register does not redefine that.
- **Incident/rollback handling**: see
  [`.claude/skills/ssot/incident-response.md.txt`](../../.claude/skills/ssot/incident-response.md.txt)
  (Production) — if a flag needs to be disabled during an incident, that
  process governs, not this register.
- This worksheet is not itself a governance artifact. It exists so flags
  don't go untracked or forgotten — ownership, expiration, and removal
  planning are metadata to record, not rules this file enforces.

## How to use

1. Add one row per feature flag when it's created.
2. Update `Current State` and `Environment(s)` as the flag's rollout changes.
3. Set a `Target Expiration Date` at creation time — flags without one tend
   to become permanent by accident.
4. When a flag is removed, keep its row for history rather than deleting it;
   set `Current State` to `Removed`.

---

## Flag Register

| Flag Name | Description | Owner | Team | Purpose | Category | Default State | Current State | Environment(s) | Creation Date | Target Expiration Date | Removal Criteria | Removal Plan | Related ADR | Related Issue/Ticket | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | | | |

---

*Deployment strategy and release process: see
[`deployment-policy.md.txt`](../../.claude/skills/ssot/deployment-policy.md.txt).
Incident and rollback handling: see
[`incident-response.md.txt`](../../.claude/skills/ssot/incident-response.md.txt).*
