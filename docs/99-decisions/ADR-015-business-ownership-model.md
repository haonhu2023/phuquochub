# ADR-015 — Mô hình sở hữu cơ sở (Business Ownership Model)

## Status
**Accepted** — 2026-07-13. Chốt Wave 1 (B8) — thực thể `business_claims` + `business_members`; giải nghĩa `business_id` (gỡ FK treo cho `media`/`contacts`/`user_roles`).

## Context
- API §18, product [business.md](../product/modules/business.md), WF-05 và RBAC (`business_owner`/`business_manager`, scope `Managed`) đều tham chiếu "Business" nhưng **chưa có thực thể** ⇒ B8 liệt kê là FK treo (chặn Prisma).
- Các FK đang trỏ tới "business" chưa có đích: `user_roles.business_id` (đã tạm `→ places`), `media.business_id` (**dự trữ**, ghi rõ "chốt khi phê duyệt `business_members`"), `contacts.owner_type='business'`.
- Docs hiện hành nghiêng **Place-centric**: product business.md §7 mô hình `business_claims`/`business_members` **khóa theo `place_id`**; `user_roles.business_id` FK → `places`.
- Bối cảnh Phú Quốc: đa số cơ sở **một địa điểm**; chuỗi/thương hiệu nhiều chi nhánh là ngoại lệ, tự nhiên biểu diễn bằng **nhiều Place**.

## Decision
Chọn **Model A — Place-centric**: **KHÔNG** tạo bảng `businesses` độc lập. "Business" = một `Place` đã được claim, cộng **lớp sở hữu**:

1. **`business_claims`** — yêu cầu nhận quyền (state machine `pending → approved | rejected | disputed | withdrawn`, có bằng chứng + audit).
2. **`business_members`** — sở hữu/ủy quyền hiệu lực (`role ∈ {owner, manager}`, `granted_by/at`, `revoked_at`).
3. **Giải nghĩa `business_id` = `places.id`** (Place đã claim). Cột `business_id`/`owner_type='business'` **giữ nguyên** để đánh dấu **provenance chính thức** (do cơ sở đăng) tách khỏi lớp **cộng đồng**:
   - `media.business_id → places` = ảnh/video **chính thức**; `media.place_id` = media **cộng đồng** (vẫn exclusive arc — ADR-009).
   - `contacts.owner_type='business', owner_id → places` = liên hệ **chính thức**; `owner_type='place'` = cộng đồng (ADR-005).
   - `user_roles.business_id → places` (giữ nguyên) = cơ sở mà scope `Managed` áp dụng.
4. **Ràng buộc nghiệp vụ cưỡng chế ở DB** (partial unique):
   - một **Owner hiệu lực/cơ sở** — `(place_id) WHERE role='owner' AND revoked_at IS NULL` (BR-B2).
   - một **vai trò hiệu lực/người/cơ sở** — `(place_id, user_id) WHERE revoked_at IS NULL`.
   - chống claim trùng — `business_claims (place_id, requester_id) WHERE status='pending'`.
5. **Liên kết Verification (ADR-008):** claim `approved` → tạo `business_members(owner)` + đặt `verifications` của Place thành `official` (`method=owner_claim`, `source=business_owner`). Không có máy trạng thái tin cậy riêng.

## Alternatives Considered
- **Model C — Thin `businesses` anchor (1:1 với Place):** `business_id → businesses.id`, sạch nghĩa, mở đường chuỗi; nhưng thêm bảng gần-thừa và **phải migrate `user_roles.business_id`** (đụng RBAC). → Không chọn (chưa cần).
- **Model B — Business-centric đầy đủ (`businesses` + `business_places` 1:N):** mạnh cho chuỗi/OTA nhưng **nặng, đi ngược docs, viết lại RBAC scope** — over-engineer cho Phú Quốc. → **Loại.**
- **Gộp provenance bằng cờ (bỏ `media.business_id`):** ít cột arc hơn nhưng phá tính đối xứng exclusive arc đã chốt ở ADR-009. → **Loại** (giữ arc official/community).

## Consequences
### Positive
- **Gỡ toàn bộ FK treo** liên quan Business ⇒ tiến gần readiness Prisma.
- Nhẹ: 2 entity, không đụng `user_roles` đang có; khớp mọi ADR đã Accepted (003/005/008/009).
- Tách **official ↔ community** rõ ràng cho media & contacts (tăng chất lượng provenance/trust).
- BR-B2 (một owner) **được DB bảo đảm**, không dựa logic ứng dụng.

### Negative / đánh đổi
- Một Place = một cơ sở; **chuỗi nhiều chi nhánh** cần mô hình brand nhẹ ở Wave 5 (nếu thực sự phát sinh).
- `business_id → places` mang **ngữ nghĩa kép** (place trong vai trò official) — phải ghi chú rõ để tránh nhầm với `place_id`.
- `contacts`/`media` toàn vẹn `owner_id`/`business_id` polymorphic-like ⇒ cưỡng chế ở tầng app cho nhánh BUSINESS.

## References
- [database.md §3.19–3.20](../data/database.md) (business_claims/business_members) · §3.5 (media) · §3.13 (user_roles) · §3.14 (contacts) · [business.md](../data/modules/business.md) (thiết kế dữ liệu) · [erd.md §2](../data/erd.md) · [api.md §18](../api/api.md) · [rbac.md](../security/rbac.md) (Business.*) · [contribution.md WF-05](../workflow/contribution.md) · [product/business.md](../product/modules/business.md)
- Related ADR: [ADR-001](ADR-001-place-is-core.md) (Place là lõi) · [ADR-003](ADR-003-no-polymorphic.md) (arc/exception) · [ADR-005](ADR-005-contact-entity.md) · [ADR-008](ADR-008-verification-model.md) (official via claim) · [ADR-009](ADR-009-media-model.md)
- Nguồn: Blocker B8 Wave 1 (Business) — chuẩn bị Prisma. Quyết định 2026-07-13 (Data Architect).
