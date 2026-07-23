# ADR-005 — Mô hình Contact (Contact Entity)

## Status
**Accepted** — 2026-07-12. Supersedes các cột liên hệ inline (`phone/hotline/website/email/facebook`) trên `places` (và Business).

## Context
- `places.md §3` lưu liên hệ **inline** (`website/facebook/hotline/email`); `database.md §3.3` có `phone/website` — lệch nhau (một phần B7).
- `verification.md §4` thiết kế `verifications.contact_id → contacts` (exclusive arc) + vòng đời xác minh cho Contact; `glossary §1.2` coi **Contact = thực thể lõi**; `rbac.md` có `Contact.Edit.Managed/.Any`; `database.md §11` đánh dấu `contacts` ⛔ chưa phê duyệt.
- **Vấn đề:** cột inline không đa giá trị/đa kênh, không xác minh/gắn nguồn **từng liên hệ**, không tái dùng cho Business & module tương lai; `contact_id` không có bảng đích ⇒ **chặn Verification (B5)**.

## Decision
Tạo bảng dùng chung **`contacts`** thiết kế **polymorphic** (`owner_type` + `owner_id`) — [database.md §3.14](../data/database.md):

- Trường: `id, owner_type, owner_id, contact_type, value, label, is_primary, verification_status, verified_at, display_order, created_at, updated_at, deleted_at`.
- `owner_type ∈ {place, business, …}` (**discriminator — lowercase snake_case, B-3**) và `contact_type ∈ {HOTLINE, PHONE, EMAIL, WEBSITE, FACEBOOK, INSTAGRAM, TIKTOK, ZALO, YOUTUBE, OTHER}` (**value-enum**, không phải discriminator) dạng **VARCHAR** → **thêm module/kênh mới không đổi schema**.
- **Bỏ hoàn toàn** cột liên hệ inline khỏi `places` và Business — mọi liên hệ đi qua `contacts`.
- `verifications.contact_id → contacts.id` (FK thật); provenance qua `source_attributions(entity_type='contact')`.

**Lý do (theo yêu cầu):** (1) chuẩn hóa dữ liệu; (2) hỗ trợ nhiều kênh liên hệ; (3) **không đổi schema** khi xuất hiện kênh/module mới; (4) tái sử dụng cho nhiều module (RealEstate, JobPosting…).

## Consequences
### Positive
- Một bảng liên hệ chuẩn hóa, đa giá trị/đa kênh; **mở khóa B5** (contact_id có bảng đích) + xác minh/gắn nguồn từng liên hệ.
- **Tái dùng đa module không đổi schema**; thu hẹp B7 (loại nhóm cột liên hệ khỏi tranh luận trường của `places`).

### Negative / đánh đổi
- **Polymorphic ⇒ mất FK/cascade từ owner** — toàn vẹn owner cưỡng chế ở tầng ứng dụng (giống `source_attributions`).
- Cache xác minh dùng `verification_status` + `verified_at` (**đã chốt B5/[ADR-008](ADR-008-verification-model.md)** — `is_verified` đã bỏ hoàn toàn).

## Alternatives Considered
- **Exclusive arc** (`place_id/business_id` nullable + `CHECK`): giữ FK/cascade thật nhưng **thêm module = +cột +CHECK** → không đạt mục tiêu "reuse không đổi schema"; hợp `media` (ít loại chủ, cần cascade) hơn Contact. → Không chọn cho Contact.
- **Giữ cột inline:** đơn giản nhất nhưng **phá `verification.md`** (`contact_id` không có đích), không đa giá trị, trái glossary/RBAC. → **Loại.**
- **Polymorphic (chọn):** đúng **ngoại lệ ADR-003** cho tham chiếu **lỏng & nhiều loại chủ** (tiền lệ `source_attributions`); tối đa khả năng tái dùng.

## References
- [database.md §3.14](../data/database.md) · [places.md §3/§6](../data/modules/places.md) · [erd.md §2](../data/erd.md) · [api.md §11.1](../api/api.md) · [verification.md §4](../data/modules/verification.md) · [source.md §5](../data/modules/source.md) · [rbac.md](../security/rbac.md) (`Contact.Edit`)
- Related ADR: [ADR-003](ADR-003-no-polymorphic.md) (ngoại lệ polymorphic) · [ADR-008](ADR-008-verification-model.md) (verification, cache `verification_status`) · [ADR-009](ADR-009-media-model.md) (media — exclusive arc, tương phản)
- Nguồn: Blocker B3 trong rà soát docs/ chuẩn bị Prisma. Quyết định 2026-07-12 (Data Architect).
