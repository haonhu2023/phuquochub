# PhuQuocHub — Decision Register

> **Nguồn chốt duy nhất** cho trạng thái mọi ADR. Mỗi khi một ADR đổi trạng thái hoặc thêm mới → cập nhật bảng này. Giải thích quy trình/quy ước xem [README.md](README.md).

## 1. ADR đang hiệu lực

> **Blocker Prisma?** = quyết định (P0) phải **Accepted** trước khi bắt đầu thiết kế Prisma Schema.

| ADR | Chủ đề | Trạng thái | Blocker Prisma? |
|---|---|---|---|
| [ADR-001](ADR-001-place-is-core.md) | Place là thực thể lõi + mô hình Place authoritative (places.md §3) | **Accepted** (2026-07-12) | ✓ |
| [ADR-002](ADR-002-place-extension.md) | Cách mở rộng Place (Hotel/Restaurant/Tour satellite; Event peer/Hybrid) | **Accepted** (2026-07-13) | ✓ |
| [ADR-003](ADR-003-no-polymorphic.md) | Không dùng quan hệ đa hình (exclusive arc khi cần toàn vẹn; media arc +event_id) | **Accepted** (2026-07-13) | ✓ |
| [ADR-004](ADR-004-weather-zone.md) | Dữ liệu thời tiết theo vùng (weather zone) | Proposed | ✗ |
| [ADR-005](ADR-005-contact-entity.md) | Mô hình Contact (`contacts` polymorphic, bỏ cột inline) | **Accepted** (2026-07-12) | ✓ |
| [ADR-006](ADR-006-price-history.md) | Mô hình Price History (`price_history` polymorphic, thay `place_tickets`) | **Accepted** (2026-07-12) | ✓ |
| [ADR-007](ADR-007-rbac-model.md) | Mô hình Role/Permission (RBAC, bỏ role ENUM) | **Accepted** (2026-07-12) | ✓ |
| [ADR-008](ADR-008-verification-model.md) | Mô hình xác minh (Verification; bỏ `is_verified`, dùng `verification_status`) | **Accepted** (2026-07-12) | ✓ |
| [ADR-009](ADR-009-media-model.md) | Mô hình media (một bảng `media`, exclusive arc) | **Accepted** (2026-07-12) | ✓ |
| [ADR-010](ADR-010-api-versioning.md) | Chiến lược phiên bản API (API Versioning) | **Accepted** (2026-07-24) | ✗ |
| [ADR-014](ADR-014-revision-model.md) | Mô hình phiên bản (`wiki_revisions`, retire `place_revisions`) | **Accepted** (2026-07-12) | ✓ |
| [ADR-015](ADR-015-business-ownership-model.md) | Mô hình sở hữu cơ sở (Business Place-centric; `business_claims`+`business_members`; `business_id→places`) | **Accepted** (2026-07-13) | ✓ |
| [ADR-016](ADR-016-audit-log-model.md) | Mô hình Nhật ký Kiểm toán (`audit_logs` append-only, đa hình, không cascade) — Trust Layer GAP-1 | **Accepted** (2026-07-13) | ✓ |
| [ADR-017](ADR-017-transport-domain-foundation.md) | Nền tảng miền Transport (satellite ADR-002 biến thể — `transport_type` là từ điển FK, không ENUM) | **Accepted** (2026-07-28) | ✗ |
| [ADR-018](ADR-018-moderation-foundation.md) | Nền tảng Kiểm duyệt (`reports` + `moderation_cases`; case ≠ hiển thị; ngoại lệ đa hình theo ADR-016) | **Accepted** (2026-08-02) | ✗ |
| [ADR-019](ADR-019-resource-scoped-authorization.md) | Phân quyền theo tài nguyên (`Managed`/`Own` so `user_roles.business_id` với tài nguyên đích; `AuthorizationContext` + resolver; fail closed) — bổ sung [ADR-007](ADR-007-rbac-model.md), **chặn** [ADR-015](ADR-015-business-ownership-model.md) M3 | **Accepted** (2026-08-04) | ✗ |

*Mẫu chuẩn: [ADR-template.md](ADR-template.md).*

## 2. Superseded ADRs

> **Không xóa** — giữ để bảo toàn lịch sử quyết định kiến trúc. Đã loại khỏi danh sách Active (§1). Chi tiết `Superseded by / Reason / Date` ghi trong từng file ADR.

| ADR | Chủ đề | Status | Superseded by | Reason | Date |
|---|---|---|---|---|---|
| [ADR-011](ADR-011-search-architecture.md) | Kiến trúc Search | Superseded | Tái cấu trúc register (tài liệu này) | Rút khỏi Active; theo dõi tại [../architecture/search.md](../architecture/search.md) | 2026-07-12 |
| [ADR-012](ADR-012-ai-architecture.md) | Kiến trúc AI | Superseded | Tái cấu trúc register (tài liệu này) | Rút khỏi Active; theo dõi tại [../ai/ai-architecture.md](../ai/ai-architecture.md) | 2026-07-12 |
| [ADR-013](ADR-013-prisma-readiness.md) | Điều kiện sẵn sàng thiết kế Prisma | Superseded | Tái cấu trúc register (tài liệu này) | Cổng điều kiện cũ; rút khỏi Active | 2026-07-12 |

## 3. Trạng thái

| Trạng thái | Ý nghĩa |
|---|---|
| **Proposed** | Đề xuất, đang thảo luận, chưa chốt |
| **Accepted** | Đã chốt và có hiệu lực |
| **Deprecated** | Không còn khuyến khích áp dụng (chưa bị một ADR cụ thể thay hẳn) |
| **Superseded** | Bị một ADR mới thay thế (ghi rõ ADR nào) |
| **Rejected** | Đã cân nhắc và **không** chọn |

---

*Tài liệu liên quan: [README.md](README.md), [../data/database.md §11](../data/database.md), [../data/erd.md](../data/erd.md).*
