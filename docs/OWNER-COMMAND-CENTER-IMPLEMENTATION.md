# Owner Command Center — implementation and release handoff

## Scope / evidence

Repository baseline: `0a636ddff28cf7be1f6fb2ec796d14317f0fd169`.
This branch also contains category editing and the missing guide editor routes
(commits `355d470`, `64bfab9`). No claim that these changes are already deployed.
The live VPS, authenticated owner session, production metrics and production DB
are NOT accessible from this workspace. Earlier Claude reports are context,
not a current production inspection.

## Requirement coverage

| Block | Implemented in this branch | Still missing for the full requested product |
|---|---|---|
| Command Center | Real active-place counts, published/verified counts, guide records, pending proposals/decisions, API source revision if built with GIT_COMMIT, migration count | Web/container digest readback; full service health/uptime; traffic |
| Action Center | Deterministic priority by visibility and actual gaps/conflicts; ordered, paginated records; direct edit/photo links; existing decision/proposal queues | Assignee/SLA management, unified per-item queue across all workflows, bulk review with CAS |
| Data Quality | Transparent three-field completeness (location/description/cover), concrete missing-data reasons, source counts | Category-specific structured quality scoring, translation coverage, image rights/quality checks, current-value evidence binding proof |
| Verification/Freshness | Active source attribution dates, overdue/due-within-7-days/fresh/unknown, first ten source links per place, field/confidence/verification dates | Editable field-level SLAs and review workflow; verification expiry records for contacts/prices; current evidence status across all evidence subsystems |
| System Health | Reuses real API health (PostgreSQL/Redis), backup status link, missing metrics explicitly unknown | External Web/MinIO probes, p50/p95/error rate, CPU/RAM, uptime, Core Web Vitals field telemetry |
| Audit | Protected read of latest 20 real events: actor UUID/role, event, object, timestamp, result, before/after status | Filtered paginated full history; safe field-level revision diff reader; tamper resistance audit |
| Analytics/SEO/Business/AI | No synthetic data or speculative integrations | GA4/Search Console authorization, telemetry, business integrations; deferred per P1/P2 |

This is a working initial dashboard, NOT completion of every P0 requirement.
An arbitrary empty metric must never be shown as zero or healthy.
A SourceAttribution is not proof of support for the current field value:
existing field-value hash verification remains authoritative.

## Data semantics

- All counts cover non-soft-deleted places, including draft/pending/published/archived.
- Verified KPI counts only published places whose current verification_status is
  official/verified/community_verified. It is not an independent evidence audit.
- Completeness is mean of location-present, nonblank description, cover-id-present;
  equal weights. NULL for no records. No penalty for absent Google Place ID,
  telephone or opening hours. Cover presence does not certify image licensing.
- Freshness covers active-source attributions of entity types place/place_field.
  At least one overdue attribution makes the place overdue. Nearest date within
  seven days is due_soon. All attributions dated in the future => fresh.
  No sources or incomplete dates => unknown (unless overdue/due_soon applies).
  No expiration is inferred from updated_at; dates are existing source schedules.
- Critical: published with missing location or flagged source conflict.
  High: published with overdue source or no source. Medium: remaining missing
  description/cover or unknown/due-soon schedules. Otherwise low.
- SQL returns 25 ordered records/page; counters are full scope. Source details
  bounded to ten/page-record; audit to latest20. Queries parameterized, read-only,
  repeatable-read transaction, statement timeout5s. No automatic polling.
- Source external links permit only HTTP(S). Audit does not expose arbitrary
  snapshots/context, IP, user agent, credential or token values.

## Authorization / migration

New permission `Ops.Dashboard.View`, granted directly ONLY to content_owner.
Frontend role gating is UX; backend RequirePermissions is authoritative.
No reuse of broad editorial permission to expose operational/audit data.
New migration `1720007000000-SeedOwnerDashboardPermission` adds permission/grant,
no content changes. down removes that permission (and its grants via existing FK
cascade), no roles or user content. Must review real migration table before run;
71→72 is an expectation only if production still has the reported 71 migrations.

API Docker final stage now records APP_REVISION from existing GIT_COMMIT build arg.
Only a full40-hex commit is shown; absent/unknown becomes null. This is build
metadata, NOT proof of live image digest or Web version. Keep OCI digest checks.

## Verification performed in this workspace

- API/Web typecheck passed.
- New API tests: permission metadata, invalid pagination, read-only snapshot,
  error propagation. (Does not substitute for real JWT 401/403 integration tests.)
- Full web suite: 128 suites /1331 tests passed before final build metadata display.
- SQL executed in isolated PGlite PostgreSQL engine, simplified fixture schema:
  empty dataset/null completeness;30 records/two pages; deleted place/source;
  four freshness states;priority; source projection; audit excludes secrets.
  NOT a full production-schema/PostGIS/AppModule/migration rehearsal.
- No Docker CLI/PostgreSQL server in this workspace. No VPS writes.

## Required release checks (do not rerun unrelated historic audits)

1. Apply cumulative branch/patch to a clean worktree based on0a636dd; preserve WIP.
2. Test new permission migration against isolated restored production DB; boot API.
3. Verify GET /admin/ops/dashboard: anonymous401, member403, owner200 after grant.
4. Compare counts/freshness to SQL on real schema, inspect query plan at target size.
5. Verify owner browser: category navigation, guides index/editor, command center,
   pagination, exact edit/photo links, source links, unknown/error states, mobile.
6. Build API/Web from final commit with established production build args. Verify
   client login request URL and both source revisions/digests; retain rollback pair.
7. Deploy only within authorized production scope, migrate permission, smoke owner
   login/edit/CAS/cache/publish and backups. Mark LIVE only after actual verification.
8. Continue missing P0 work above as separate bounded changes. Avoid claiming full
   operational readiness merely because counters and unit tests pass.
