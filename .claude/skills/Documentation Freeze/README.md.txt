# Documentation Freeze Skill

Version: 1.0.0  
Status: Production  
Owner: Chief Documentation Architect  
Priority: Critical  
Execution Mode: Read-only  
Applies To: PhuQuocHub and all repository documentation

---

## 1. Overview

Documentation Freeze is the official documentation readiness and governance
skill for the PhuQuocHub project.

Its responsibility is to determine whether the complete documentation set is:

- present;
- complete;
- internally consistent;
- cross-document consistent;
- supported by repository evidence;
- free from unresolved blockers;
- ready to become the Single Source of Truth.

Documentation Freeze is the mandatory gate between architecture design and
large-scale code generation.

No Sprint Planner, Batch Generator, code-generation agent, migration generator,
API generator, or production implementation process may treat documentation as
authoritative until Documentation Freeze has issued an approved freeze decision.

---

## 2. Mission

The mission of Documentation Freeze is to establish one stable, approved,
auditable, and immutable documentation baseline for the project.

The skill protects the project from:

- architecture drift;
- database drift;
- OpenAPI drift;
- RBAC drift;
- workflow drift;
- terminology conflicts;
- duplicated definitions;
- undocumented decisions;
- incomplete schemas;
- speculative code generation;
- AI agents making architectural decisions during implementation.

---

## 3. Primary Objective

The skill must answer one question:

> Can Claude Code generate implementation code without making undocumented
> architectural, database, API, RBAC, workflow, security, or naming decisions?

If the answer is no, Documentation Freeze must not approve the documentation.

---

## 4. Execution Mode

Documentation Freeze operates in strict read-only mode.

It may:

- read documentation;
- inspect repository structure;
- search for files;
- compare documents;
- identify inconsistencies;
- validate references;
- count entities;
- inspect ADR states;
- inspect OpenAPI contracts;
- collect evidence;
- generate audit reports;
- generate a freeze certificate when all conditions pass.

It must not:

- modify documentation;
- generate production code;
- create migrations;
- redesign architecture;
- create new entities;
- create new endpoints;
- change RBAC;
- change workflow;
- change ADR status;
- update the Decision Register;
- silently resolve conflicts;
- guess missing requirements.

---

## 5. Authority

Documentation Freeze derives its authority from:

1. the Single Source of Truth governance policy;
2. accepted Architecture Decision Records;
3. the Decision Register;
4. approved architecture documentation;
5. approved data, API, security, RBAC, and workflow specifications.

The repository implementation is evidence, but it is not the architectural
authority.

When implementation conflicts with frozen documentation, the implementation is
considered drift.

When authoritative documents conflict with each other, Documentation Freeze
must report a blocker.

---

## 6. Required Inputs

The skill must inspect every documentation artifact available in the repository.

Typical inputs include:

- root `README.md`;
- documentation index;
- vision;
- product requirements;
- architecture;
- architecture diagrams;
- ADR directory;
- Decision Register;
- roadmap;
- sprint plan;
- database specification;
- ERD;
- data dictionary;
- entity catalog;
- migration strategy;
- API documentation;
- OpenAPI specification;
- RBAC specification;
- permission matrix;
- workflow specification;
- security documentation;
- search documentation;
- SEO documentation;
- AI policy;
- analytics documentation;
- growth documentation;
- deployment documentation;
- monitoring documentation;
- coding standards;
- naming conventions;
- glossary;
- wireframes;
- operational runbooks.

The actual repository is authoritative regarding which files exist.

The skill must never invent a missing file.

If a required artifact cannot be found, report:

`NOT FOUND`

---

## 7. Required Outputs

Documentation Freeze must produce:

1. Executive Summary
2. Documentation Freeze Score
3. Freeze Matrix
4. Documentation Inventory
5. Missing Documents
6. Incomplete Documents
7. Cross-document Consistency Findings
8. SSOT Authority Map
9. ADR Validation
10. Entity Validation
11. Database Validation
12. OpenAPI Validation
13. RBAC and Workflow Validation
14. Security Validation
15. Broken Link and Reference Report
16. Blocking Issues
17. Required Fixes
18. Code-generation Readiness
19. Freeze Decision
20. Freeze Certificate, only when all required gates pass

---

## 8. Freeze Decisions

Only the following freeze decisions are valid.

### NOT READY

Use when documentation contains fundamental gaps, unresolved contradictions, or
critical missing artifacts.

### READY AFTER FIXES

Use when the documentation architecture is fundamentally sound, but a finite,
clearly defined set of corrections is still required.

### DOCUMENTATION FROZEN

Use only when:

- all required documents exist;
- no incomplete authoritative document remains;
- no blocker remains;
- no unresolved contradiction remains;
- the SSOT authority map is valid;
- all accepted ADRs are consistent;
- the Decision Register matches the ADR set;
- the database documentation is consistent;
- the ERD and Data Dictionary are consistent;
- OpenAPI is valid and complete for the approved scope;
- RBAC and workflow definitions are consistent;
- code generation can proceed without architectural guessing.

A freeze certificate must not be issued for `NOT READY` or
`READY AFTER FIXES`.

---

## 9. Core Principles

### 9.1 Evidence before conclusion

Every finding must cite repository evidence.

If evidence does not exist, report `NOT FOUND`.

### 9.2 No guessing

Missing information is a blocker or documented gap, not an invitation to invent
a solution.

### 9.3 One authority per domain

Each major domain must have exactly one authoritative source.

Examples:

- Architecture → one authoritative architecture document;
- Database → one authoritative database specification;
- Entity definitions → one authoritative entity catalog or module document;
- API → OpenAPI;
- RBAC → one authoritative RBAC specification;
- Workflow → one authoritative workflow specification;
- Naming → one authoritative coding or naming standard.

Multiple competing authorities constitute a blocker.

### 9.4 Documentation precedes implementation

Documentation must be approved before implementation begins.

### 9.5 Frozen documentation is immutable during implementation

Changes after freeze require formal change control and, when applicable, an ADR.

### 9.6 No certificate without proof

Correct-looking documentation is not sufficient.

The skill must establish evidence of completeness, consistency, and authority.

---

## 10. Audit Phases

Documentation Freeze executes the following phases in order.

### Phase 1 — Repository discovery

Identify:

- documentation roots;
- documentation files;
- ADR files;
- specifications;
- diagrams;
- templates;
- missing expected directories;
- repository branch and commit when available.

### Phase 2 — Document inventory

Classify every artifact by:

- path;
- type;
- owner;
- version;
- status;
- authority;
- lifecycle state;
- completeness;
- relationships.

### Phase 3 — Completeness validation

Detect:

- missing documents;
- missing sections;
- empty documents;
- placeholders;
- TODO;
- FIXME;
- TBD;
- Draft;
- Stub;
- Outline Only;
- Coming Soon;
- unresolved questions.

### Phase 4 — Cross-document consistency

Compare:

- architecture against ADR;
- ADR against Decision Register;
- database against ERD;
- database against Data Dictionary;
- entity definitions against API;
- API documentation against OpenAPI;
- RBAC against endpoint permissions;
- workflow against API states;
- coding standards against naming conventions;
- roadmap against accepted architecture.

### Phase 5 — SSOT validation

Determine exactly one authoritative source for every major domain.

### Phase 6 — ADR validation

Verify:

- all architectural decisions have ADR coverage;
- Accepted ADRs do not conflict;
- Proposed ADRs are not treated as Accepted;
- Superseded ADRs are not treated as active;
- Decision Register status matches ADR status.

### Phase 7 — Entity and data validation

Verify:

- total entity count;
- entity catalog;
- ERD coverage;
- Data Dictionary coverage;
- foreign keys;
- relationships;
- enums;
- discriminators;
- indexes;
- constraints;
- ownership.

### Phase 8 — API and OpenAPI validation

Verify:

- OpenAPI exists;
- documented paths exist;
- request schemas exist;
- response schemas exist;
- security requirements exist;
- error responses exist;
- pagination exists where required;
- no dangling references remain.

### Phase 9 — Security, RBAC, and workflow validation

Verify:

- authentication;
- authorization;
- role definitions;
- permission definitions;
- permission matrix;
- workflow states;
- workflow transitions;
- audit requirements;
- rate limits;
- security controls.

### Phase 10 — Freeze decision

Apply blocker and severity policies and issue exactly one final decision.

---

## 11. Blocking Conditions

Documentation Freeze must not approve the documentation when any of the
following exists:

- missing authoritative architecture;
- missing Decision Register when ADR governance is required;
- missing accepted ADR for a major architectural decision;
- conflicting Accepted ADRs;
- competing authoritative database definitions;
- competing entity definitions;
- ERD and Data Dictionary conflict;
- entity count mismatch;
- missing OpenAPI for a contract-first project;
- dangling OpenAPI references;
- RBAC and endpoint permission contradiction;
- workflow contradiction;
- undefined discriminator casing;
- unresolved database relationship model;
- unresolved media ownership model;
- missing migration strategy;
- unresolved security architecture;
- placeholder inside an authoritative document;
- Claude Code would need to invent behavior during code generation.

---

## 12. Relationship With Other Skills

### SSOT

Defines authority and documentation governance.

Documentation Freeze validates that the SSOT is complete and stable.

### Sprint Planner

May run only after documentation is frozen or after an explicitly approved
partial freeze.

### Batch Generator

May generate code only from an approved Sprint Plan based on frozen
documentation.

### Architecture Review

Verifies implementation against the frozen documentation.

### Sprint Acceptance

Determines whether a Sprint implementation satisfies the frozen baseline.

### Production Gate

Determines whether the accepted implementation is ready for production.

---

## 13. Recommended Skill Workflow

```text
SSOT
  ↓
Documentation Freeze
  ↓
Sprint Planner
  ↓
Batch Generator
  ↓
Batch Acceptance
  ↓
Architecture Review
  ↓
Sprint Acceptance
  ↓
Production Gate
```

Documentation Freeze is not a substitute for Architecture Review.

Documentation Freeze validates documentation before implementation.

Architecture Review validates implementation after generation.

---

## 14. Repository Location

Recommended location:

```text
.claude/skills/documentation-freeze/
```

Recommended invocation:

```text
Use the documentation-freeze skill.

Perform a complete read-only documentation audit.

Do not modify files.
Do not generate code.
Issue a freeze certificate only when every required gate passes.
```

---

## 15. Success Criteria

The Documentation Freeze skill succeeds when:

- the repository has one coherent documentation system;
- every planned authoritative artifact exists;
- every authoritative artifact is complete;
- every major architectural decision is traceable;
- every domain has exactly one authoritative source;
- all cross-document relationships are consistent;
- every blocker is identified before code generation;
- Claude Code can implement the approved scope without making architectural
  decisions;
- an auditable documentation baseline is created;
- future changes are governed through ADR and formal change control.

The ultimate success condition is:

> The approved software can be generated, reviewed, tested, and maintained using
> the frozen documentation alone, without relying on chat history, personal
> memory, undocumented assumptions, or AI invention.