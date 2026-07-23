# Enterprise Engineering Framework
## 01 - Authority and Scope Policy

Version: 1.0.0
Status: Draft
Owner: Enterprise Architecture

# Purpose

This document defines governance authority, scope, ownership and approval
rules for the Enterprise Engineering Framework (EEF).

# Relationship to Existing Governance

This policy governs the **Enterprise Engineering Framework** itself — the
workflow, code-generation, testing, deployment, and operations governance
built under `enterprise-engineering-framework/`.

It does **not** redefine, override, or duplicate
[`.claude/skills/ssot/authority-policy.md.txt`](../../.claude/skills/ssot/authority-policy.md.txt)
(Status: Production), which remains the sole authority for PhuQuocHub's
**documentation and artifact hierarchy** (Architecture → ADR → Decision
Register → Database Docs → OpenAPI → Workflow → Coding Standards →
Repository Standards → Implementation → Generated Files).

Where the two overlap — e.g. both reference "SSOT" or "Documentation
Freeze" — the existing `.claude/skills/ssot/authority-policy.md.txt`
hierarchy governs for questions of *documentation authority*. This
document's hierarchy governs for questions of *engineering-framework
process authority* (which EEF artifact, gate, or workflow rule applies).
If a future conflict is found between the two, it must be recorded and
resolved per the Source of Truth Policy below, not silently decided.

## Authority Hierarchy

1. Explicit user instructions
2. Repository instructions (CLAUDE.md / AGENTS.md)
3. Approved Architecture Decisions
4. Documentation Freeze
5. SSOT
6. Approved Contracts
7. Repository implementation
8. Historical artifacts

Lower authority may never override higher authority.

# Scope

This framework governs:

- Architecture
- Documentation
- Code generation
- Testing
- Deployment
- Operations
- Continuous improvement

It does not replace business requirements.

# Ownership

Every artifact must have:

- Owner
- Reviewer
- Status
- Version
- Last Updated

No anonymous governance artifacts are permitted.

# Approval Gates

Required before a document becomes authoritative:

- Technical review
- Architecture review
- Consistency review
- Repository compatibility review
- User approval

# Source of Truth Policy

Each topic must have exactly one authoritative source.

If multiple documents define the same behavior:

- Stop
- Record conflict
- Recommend consolidation

Never silently choose one.

# Change Control

Every governance change requires:

1. Reason
2. Impact assessment
3. Related artifacts
4. Validation plan
5. Rollback strategy
6. Approval

# Evidence Requirements

Every governance decision must reference:

- repository path
- document
- command output
- code reference

No unsupported assertions.

# Exceptions

Emergency exceptions must include:

- reason
- duration
- owner
- mitigation
- expiration

Temporary exceptions shall not become permanent policy.

# Validation Checklist

- Authority verified
- Scope defined
- Owner assigned
- References resolved
- No duplicate source of truth
- Approval recorded

# Exit Criteria

This policy is complete when:

- Authority hierarchy is accepted.
- Scope is understood.
- Ownership exists.
- Approval workflow is documented.
- Conflicts are resolved.

# END OF FILE
