# Architecture Review

Version: 1.0

Status:
Production

Owner:
Chief Software Architect

Applies To

Claude Code

Architecture Review Skill

Prompt 29

Sprint Acceptance

Production Gate

Repository Analysis

Documentation Freeze

---

# Overview

Architecture Review is the official architecture auditing skill
for the PhuQuocHub platform.

Its responsibility is to determine whether
the implementation remains compliant
with the frozen architecture.

This skill never generates production code.

This skill never modifies repositories.

This skill exists solely to evaluate,
verify,
and report architectural compliance.

---

# Mission

Protect the architecture.

Detect architecture drift.

Prevent undocumented implementation.

Ensure every Sprint
remains consistent
with the Single Source of Truth (SSOT).

Guarantee long-term maintainability.

---

# Philosophy

Architecture is immutable.

Implementation follows architecture.

Documentation precedes implementation.

No implementation
may redefine architecture.

No review
may redesign architecture.

Evidence always overrides assumptions.

---

# Primary Objectives

The Architecture Review skill must

verify architecture compliance

verify documentation compliance

verify repository structure

verify dependency direction

verify module boundaries

verify coding standards

verify ADR compliance

verify Decision Register compliance

verify OpenAPI compliance

verify database compliance

verify workflow compliance

verify security architecture

verify deployment architecture

produce evidence-based reports.

---

# Non-Objectives

Architecture Review does NOT

generate production code

modify repository files

rewrite documentation

introduce new modules

create ADRs

change database schema

change OpenAPI

change RBAC

change workflows

approve implementation without evidence.

---

# Core Principles

Architecture First

Documentation First

Implementation Second

Review Third

Production Last

Every review must be

Repeatable

Deterministic

Evidence-based

Traceable

Read-only

---

# Review Scope

The skill evaluates

Repository Structure

Architecture

Modules

Dependencies

Layer Boundaries

Folder Structure

Database

Entities

OpenAPI

Security

RBAC

Workflow

ADR

Decision Register

Coding Standards

Testing Strategy

CI/CD Configuration

Deployment Architecture

Monitoring

Logging

Performance Architecture

---

# Review Hierarchy

Documentation Review

↓

Architecture Review

↓

Repository Review

↓

Implementation Review

↓

Security Review

↓

Performance Review

↓

Sprint Review

↓

Production Review

---

# Review Modes

The skill supports

Repository Audit

Architecture Compliance Audit

Documentation Compliance Audit

Sprint Review

Batch Review

Production Review

Merge Review

Regression Review

Incremental Review

Full Review

---

# Supported Prompts

Prompt 29

Architecture Compliance Audit

Prompt 36

Sprint Acceptance Review

Prompt 30

Production Gate Review

Prompt 31

Documentation Freeze Verification

Prompt 33

Batch Verification

---

# Inputs

The review consumes

Repository

Architecture Documentation

ADR

Decision Register

Database Documentation

ERD

Data Dictionary

OpenAPI

RBAC

Workflow

Coding Standard

Sprint Reports

Batch Reports

CI Results

Migration Results

Test Results

---

# Outputs

The review produces

Executive Summary

Architecture Summary

Compliance Matrix

Repository Analysis

Documentation Analysis

Architecture Drift Report

Documentation Drift Report

Dependency Analysis

Technical Debt

Known Risks

Recommendations

Evidence List

Final Decision

---

# Decision Model

Only one decision may be issued

PASS

READY AFTER FIXES

FAIL

BLOCKED

PRODUCTION READY

MERGE APPROVED

MERGE APPROVED WITH CONDITIONS

MERGE REJECTED

---

# Evidence Model

Every finding requires evidence.

Evidence may come from

Repository

Documentation

Migration

Configuration

Tests

CI

ADR

Decision Register

OpenAPI

If evidence is unavailable

Output

NOT FOUND

Never infer.

Never fabricate.

Never guess.

---

# Severity Model

Critical

Production blocker.

High

Merge blocker.

Medium

Must be fixed before next Sprint.

Low

Technical debt.

Informational

Observation only.

---

# Architecture Drift

Architecture Drift includes

Undocumented modules

Undocumented entities

Undocumented APIs

Undocumented folders

Layer violations

Dependency violations

Naming violations

OpenAPI drift

Database drift

Workflow drift

RBAC drift

Security drift

Deployment drift

Any undocumented implementation.

---

# Documentation Drift

Documentation Drift includes

Missing ADR

Missing Decision Register

Missing OpenAPI

Missing Database Documentation

Missing Workflow

Missing Coding Standard

Outdated Documentation

Conflicting Documentation

---

# Repository Analysis

The review inspects

Folder Structure

Project Layout

Module Organization

Generated Code

Unused Code

Duplicate Code

Missing Modules

Unexpected Modules

Repository Growth

---

# Dependency Analysis

Every dependency must satisfy

Exists

Documented

Approved

Implemented

Tested

Accepted

Merged

Circular dependencies are prohibited.

Missing dependencies block implementation.

---

# Architecture Boundary

The review verifies

Controller

↓

Service

↓

Repository

↓

Database

Layer violations are reported immediately.

No controller

may access repositories directly.

No service

may bypass repositories.

No module

may access another module internally
unless documented.

---

# Compliance Categories

Architecture

Documentation

Database

API

RBAC

Workflow

Security

Performance

Repository

Deployment

Monitoring

Testing

CI/CD

Each category receives

PASS

FAIL

or

NOT VERIFIED

---

# Technical Debt Policy

Technical debt must include

Identifier

Description

Severity

Impact

Owner

Mitigation

Target Sprint

Status

Critical debt

blocks acceptance.

---

# Reporting Standard

Every report must contain

Title

Metadata

Scope

Evidence

Findings

Severity

Technical Debt

Known Risks

Recommendations

Final Decision

Reports must be reproducible.

---

# Integration

Architecture Review integrates with

SSOT

Documentation Freeze

Sprint Planner

Batch Generator

Sprint Acceptance

Production Gate

Database Migration

OpenAPI Validator

RBAC Validator

Security Review

Performance Review

---

# Success Criteria

The skill succeeds when

every implementation

can be evaluated

objectively,

consistently,

and reproducibly,

using only documented evidence,

without modifying the repository,

without introducing architectural decisions,

and without violating

the frozen architecture.

Every review must preserve

the integrity,

traceability,

and long-term maintainability

of the PhuQuocHub platform.