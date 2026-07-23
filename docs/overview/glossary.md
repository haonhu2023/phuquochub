# PhuQuocHub — Thuật ngữ (Glossary)

> **Mục đích:** định nghĩa thống nhất các thuật ngữ nghiệp vụ và kỹ thuật dùng xuyên suốt tài liệu, tránh mỗi nơi hiểu một kiểu. Đây là khung (outline) — nội dung chi tiết bổ sung sau.

## 1. Các mục chính

### 1.1 Thực thể cốt lõi (Core entities)
- **Place** — địa điểm/POI, thực thể lõi.
- **Contact** — thông tin liên hệ của địa điểm.
- **PriceHistory** — lịch sử giá.
- **Source** — nguồn gốc dữ liệu. Xem [data/modules/source.md](../data/modules/source.md).
- **Verification** — trạng thái xác minh. Xem [data/modules/verification.md](../data/modules/verification.md).
- **WikiRevision** — bản ghi phiên bản nội dung.
- **Review / Community Post / Comment** — nội dung cộng đồng.

### 1.2 Vai trò người dùng (Roles)
- **10 vai trò** (dạng **dữ liệu**, không ENUM): `guest, member, local_guide, contributor, business_owner, business_manager, moderator, administrator, super_administrator, ai_agent` — chi tiết ở [security/rbac.md §4](../security/rbac.md).
- Vai trò gán qua bảng `user_roles`; **cột `users.role` ENUM đã bỏ** ([database.md §3.9–3.13](../data/database.md), [ADR-007](../99-decisions/ADR-007-rbac-model.md)).
- **Business Owner** — chủ cơ sở đã "claim" trang (scope Managed).
- **AI Agent** — service principal (`users.is_service_account=true`), không kế thừa vai trò con người.

### 1.3 Thuật ngữ nghiệp vụ (Domain)
- **Claim** — chủ cơ sở nhận quyền quản lý trang địa điểm.
- **Verified / Official / Community Verified** — các mức tin cậy.
- **Moderation** — kiểm duyệt đóng góp.
- **Provenance** — truy vết nguồn gốc dữ liệu.

### 1.4 Thuật ngữ kỹ thuật (Technical)
- **PostGIS, SRID 4326, GIST index** — dữ liệu không gian.
- **Rollup / Aggregate-first** — tổng hợp số liệu. Xem [data/modules/analytics.md](../data/modules/analytics.md).
- **HyperLogLog (HLL)** — ước lượng số lượng duy nhất.
- **Modular Monolith, Monorepo** — kiến trúc.
- **Exclusive arc** — mẫu FK loại trừ (thay polymorphic).

## 2. Ghi chú — nội dung bổ sung sau

- [ ] Định nghĩa đầy đủ từng mục (một dòng/thuật ngữ) theo bảng `Thuật ngữ | Định nghĩa | Tham chiếu`.
- [ ] Thuật ngữ song ngữ (vi/en) khi mở đa ngôn ngữ.
- [ ] Viết tắt (abbreviations) toàn dự án.

---

*Tài liệu liên quan: [vision.md](./vision.md), [database.md](../data/database.md)*
