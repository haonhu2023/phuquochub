# ADR-013 — Điều kiện sẵn sàng thiết kế Prisma (Prisma Readiness)

**Status:** Superseded
- **Superseded by:** Tái cấu trúc Decision Register — [decision-register.md](decision-register.md) *(không có ADR kế nhiệm riêng lẻ)*.
- **Reason:** Cổng điều kiện Prisma cũ; rút khỏi danh sách Active khi tái cấu trúc register. Giữ file để bảo toàn lịch sử; các link ADR bên dưới đã cập nhật theo cách đánh số mới.
- **Date:** 2026-07-12

## Mục đích
*(khung)* Định nghĩa **cổng điều kiện**: chỉ bắt đầu thiết kế Prisma Schema khi mọi ADR blocker (P0) đã **Accepted** và ERD được cập nhật tương ứng.

## Bối cảnh
*(khung — chờ điền)*

## Vấn đề cần giải quyết
*(khung — chờ điền)*

## Quyết định
*(khung — chờ điền)* — điều kiện: [ADR-001](ADR-001-place-is-core.md), [ADR-002](ADR-002-place-extension.md), [ADR-003](ADR-003-no-polymorphic.md), [ADR-005](ADR-005-contact-entity.md), [ADR-006](ADR-006-price-history.md), [ADR-007](ADR-007-rbac-model.md), [ADR-008](ADR-008-verification-model.md), [ADR-009](ADR-009-media-model.md), [ADR-014](ADR-014-revision-model.md) = Accepted.

## Tác động
*(khung — chờ điền)*

## Tài liệu liên quan
- [database.md §11](../data/database.md) · [erd.md](../data/erd.md) · [README.md](README.md)

## Những điểm còn mở
*(khung — chờ điền)*

## Related ADR
- Tất cả ADR nhóm P0 (001, 002, 003, 005, 006, 007, 008, 009, 014).

## Addendum: Runtime Persistence Authority (OD-B7, 2026-07-24)

- **Recorded:** 2026-07-24, by owner decision OD-B7 (B7-A) — `docs/delivery/decisions/OWNER-DECISIONS-2026-07-24.md`. Resolves GAP-15 (`docs/delivery/workstreams/place.yaml`).
- **This addendum does not reopen or change ADR-013's Superseded status above.** It closes a
  separate, previously undecided question this ADR's "readiness gate" framing left ambiguous: which
  system is the **runtime persistence authority**, now that implementation has actually happened.

**Determination.** The repository's runtime persistence authority is:
1. **TypeORM entities** — `@Entity`-decorated classes under `apps/api/src/modules/*/entities/*.entity.ts`.
2. **TypeORM migrations** — the 20 forward-only migrations in `apps/api/src/core/database/migrations/`, run via the dedicated `data-source.ts` DataSource.
3. **PostgreSQL** — connected at runtime exclusively through `TypeOrmModule.forRootAsync` (`apps/api/src/core/database/database.module.ts`, `synchronize: false`).

**`prisma/schema.prisma` is reference documentation only.** It is not executed, not a runtime
dependency, and generates nothing:
- No `prisma` or `@prisma/client` package dependency exists in any `package.json` in this repository.
- No script (root or `apps/api`), CI workflow, or build step invokes Prisma.
- The file's own header states it explicitly: *"KHÔNG sinh migration, KHÔNG sinh code, KHÔNG sinh
  API"* (do not generate migrations, code, or an API).
- Its declared `generator client` block has never been run — no generated Prisma client exists or is
  imported anywhere in the codebase.

It remains useful and is **kept, not deleted**, as a data-model cross-reference: a handful of TypeORM
entity/enum files cite it in comments ("khớp prisma/schema.prisma") purely to keep field naming
consistent with the approved entity catalog (`docs/data/database.md §11`) it was drafted from.

**Consequence.** No runtime behaviour changes as a result of this addendum — Prisma held no runtime
authority before this record either. This closes the ambiguity that `docs/data/database.md §11`'s
prior heading ("chuẩn bị sinh Prisma") left open, and gives GAP-15 a citable architectural answer
rather than only a delivery-task report.
