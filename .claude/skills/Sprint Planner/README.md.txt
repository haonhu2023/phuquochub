# Sprint Planner Skill

Version: 1.0

Owner:
Chief Software Architect

Status:
Production Ready

---

# Purpose

Sprint Planner là bộ não điều phối toàn bộ quá trình phát triển phần mềm.

Skill này KHÔNG sinh code.

Skill này chỉ quyết định:

- Sprint nào cần làm
- Batch nào cần làm
- Module nào được phép sinh code
- Module nào chưa được phép
- Dependency giữa các module
- Thứ tự phát triển
- Rủi ro
- Ước lượng công việc
- Tiêu chí hoàn thành

Sprint Planner là điểm bắt đầu của mọi Sprint.

Claude chỉ được phép sinh code sau khi Sprint Planner phê duyệt.

---

# Scope

Sprint Planner chịu trách nhiệm:

✔ Repository Analysis

✔ Sprint Planning

✔ Batch Planning

✔ Dependency Analysis

✔ Estimation

✔ Risk Analysis

✔ Architecture Boundary

✔ Merge Planning

✔ Milestone Planning

✔ Release Planning

Sprint Planner KHÔNG:

- generate code
- modify code
- redesign architecture
- change ADR

---

# Workflow

Documentation Freeze

↓

Repository Analysis

↓

Dependency Analysis

↓

Sprint Planning

↓

Batch Planning

↓

Architecture Validation

↓

Risk Analysis

↓

Sprint Approval

↓

Batch Generator

↓

Architecture Review

↓

Sprint Acceptance

↓

Production Gate

---

# Inputs

Sprint Planner đọc:

README

Vision

Architecture

ADR

Decision Register

Roadmap

Database

ERD

OpenAPI

Coding Standard

Security

Workflow

Repository

Git Status

Current Sprint

Completed Sprint

---

# Outputs

Sprint Report

Batch Report

Dependency Graph

Risk Report

Milestone

Estimated LOC

Estimated Files

Estimated Duration

Acceptance Criteria

Merge Criteria

---

# Principles

Sprint Planner phải:

không suy đoán

không phát minh module

không thay đổi thiết kế

không thêm API

không thêm entity

không thêm workflow

không thay đổi ADR

mọi quyết định phải dựa trên tài liệu.

---

# Sprint Lifecycle

Sprint

↓

Planning

↓

Approval

↓

Batch 1

↓

Review

↓

Batch 2

↓

Review

↓

...

↓

Sprint Acceptance

↓

Architecture Audit

↓

Next Sprint

---

# Success Criteria

Một Sprint chỉ được phép hoàn thành nếu:

mọi batch PASS

mọi Architecture Review PASS

mọi ADR PASS

mọi test PASS

mọi migration PASS

mọi OpenAPI PASS

mọi Security PASS

mọi CI PASS

mọi tài liệu cập nhật

---

# Related Skills

Documentation Freeze

SSOT

Batch Generator

Architecture Review

Sprint Acceptance

Production Gate

Testing

Security Review

Performance Review
