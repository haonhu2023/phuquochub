# ============================================================================
# Enterprise Engineering Framework (EEF)
# 05 — Validation Commands
# Version: 1.0.0
# Status: Draft
# ============================================================================

# Relationship to Existing Governance

This document governs the **discovery and execution of repository CLI
commands** (install, build, lint, typecheck, test, e2e) — the operational
mechanics of running validation, not what is being validated.

It does not duplicate
[`.claude/skills/ssot/validation-policy.md.txt`](../../.claude/skills/ssot/validation-policy.md.txt)
(Status: Production), which governs *domain conformance* validation
(architecture, database, OpenAPI, workflow, RBAC, etc. against the SSOT) —
a broader, artifact-level validation framework, not command execution.

It also does not duplicate
[`.claude/skills/ssot/evidence-policy.md.txt`](../../.claude/skills/ssot/evidence-policy.md.txt),
which governs evidence for *documentation and governance conclusions*
(Evidence ID, Document Version, Owner), not command-execution records.

**Known vocabulary inconsistency**: this document's Result Classification
(§6: `PASS / FAIL / NOT RUN / NOT FOUND / BLOCKED`) differs from
`validation-policy.md.txt`'s Validation Status (`PASS / WARNING / FAIL /
BLOCKED / NOT FOUND / UNKNOWN`). Both apply to different subjects (command
execution vs. domain conformance) so this is not a conflict requiring
resolution, but it is recorded here so the difference is never mistaken for
an oversight.

---

# 1. Purpose

This document defines how repository validation commands are discovered,
executed, interpreted, and reported.

Claude Code MUST use repository-defined commands whenever available.

---

# 2. Principles

- Inspect before executing.
- Never invent commands.
- Execute from the correct working directory.
- Record exit codes.
- Preserve command output.
- Mark skipped checks as NOT RUN.

---

# 3. Validation Categories

Required categories:

- Dependency Installation
- Build
- Lint
- Format Check
- Type Check
- Unit Tests
- Integration Tests
- End-to-End Tests
- Architecture Validation
- Security Scan
- Documentation Validation

---

# 4. Command Discovery

Search in:

- package.json
- workspace configuration
- Makefile
- Taskfile
- CI/CD pipelines
- README
- CLAUDE.md
- AGENTS.md

If no command exists:

Status = NOT FOUND

---

# 5. Execution Record

For every command capture:

- Command
- Working Directory
- Exit Code
- Duration
- Result
- Important Output

---

# 6. Result Classification

PASS
FAIL
NOT RUN
NOT FOUND
BLOCKED

Only PASS indicates successful execution.

---

# 7. Failure Handling

On failure:

1. Stop dependent validations.
2. Preserve evidence.
3. Explain impact.
4. Recommend corrective action.

Do not hide failures.

---

# 8. Waiver Policy

A FAIL or BLOCKED result (§6) may be waived to allow progression without
re-running the command. Waiving does not change the recorded Result
Classification — the original status stands as evidence (§5); the waiver is
recorded alongside it, not in place of it.

A gate may be waived only when all of the following exist:

- Business justification
- Documented risk
- Recorded approval
- Defined expiration date

Waived commands must still appear in Reporting (§9), listed separately from
passing commands. An expired waiver reverts to its original blocking status;
the command must be re-run.

If the waiver process grows beyond this (e.g. multi-step approval chains,
waiver registries), it should be extracted into its own document after
Architecture Review. Until then, this section is the single source of truth
for waivers.

---

# 9. Reporting

Summarize:

- Commands Executed
- Commands Skipped
- Failures
- Waived (§8)
- Blockers
- Overall Validation Status

---

# 10. Compliance

Claims such as:

- "Build succeeded"
- "Tests passed"
- "Architecture validated"

MUST be backed by command evidence.

---

# 11. Exit Criteria

Validation is complete only when every required command has either:

- PASS
- FAIL
- NOT RUN
- NOT FOUND
- BLOCKED

with supporting evidence, or is explicitly waived per §8.

# END OF DOCUMENT
