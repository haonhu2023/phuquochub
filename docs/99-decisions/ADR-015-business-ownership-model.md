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

## Tình trạng triển khai (Implementation Status)

*(Mục này CHỈ ghi lại tiến độ triển khai — KHÔNG sửa bất kỳ nội dung quyết định nào ở §Decision/
§Alternatives/§Consequences. Cùng quy ước ADR-018/ADR-019's milestone banner.)*

**Business Claim Foundation (Claim Decision Workflow): ✅ ĐÃ TRIỂN KHAI (2026-08-05).** ADR này
KHÔNG có M1/M2 nào từng tồn tại trong repository trước lần triển khai này — `business_claims`/
`business_members` chưa từng được migrate (xác nhận trong `docs/delivery/state.yaml` xuyên suốt
2026-07-29 → 2026-08-04: "no dependency on unmigrated business_claims/members"). Đây là lần triển
khai ADR-015 ĐẦU TIÊN trong repo, bao trùm toàn bộ prerequisite (enum/entity/repository/migration/
permission/module) CỘNG claim submission + moderator decision.

Owner-quyết định phạm vi (2026-08-05), ghi lại nguyên văn vì đổi cách §Decision mục 5 được hiện thực
hoá — KHÔNG đổi quyết định đó:

1. **Verification = cache-column, KHÔNG phải entity đầy đủ.** §Decision mục 5 nói "đặt `verifications`
   của Place thành `official`" — đọc theo nghĩa ADR-008 §Decision mục 3 ("cache `verification_status`/
   `verified_at` — thay hoàn toàn `is_verified`"), KHÔNG theo nghĩa bảng `verifications`/
   `verification_events`/`verification_votes` mà ADR-008 §Decision mục 1/2/6-9 thiết kế — những bảng
   đó **chưa từng được migrate** (chỉ cache tồn tại trên `places`). Claim approved → ghi thẳng
   `places.verification_status = 'official'` + `places.verified_at = now()`. **ADR-008 vẫn hoãn**,
   không mở lại bởi milestone này.
2. **`Business.Verify` là permission MỚI, TÁCH BIỆT khỏi `Verification.Verify`.** rbac.md dòng 98/191/
   275 đã tài liệu hoá `Business.Verify` từ trước nhưng chưa từng seed — `SeedBusinessPermissions`
   (migration `1720003700000`) seed nó, grant `moderator` (administrator/super_administrator kế thừa
   qua DAG sẵn có, không seed tường minh).
3. **`dispute` là kết quả TỰ ĐỘNG, không phải lựa chọn thủ công của moderator.** §Decision mục 5 +
   business.md §4 sơ đồ: khi `decide(approve)` gặp một `business_members(owner)` hiệu lực đã tồn tại
   cho `place_id` đó, claim tự chuyển `disputed` thay vì lỗi — `BusinessClaimDecision` enum (API) chỉ
   nhận `approve`/`reject`, không có `dispute` như một input.
4. **`withdraw` có endpoint riêng, KHÔNG qua `Business.Verify`** — actor = chính requester
   (business.md §4: "withdrawn | ... | requester"), khác hẳn approve/reject (actor = moderator).

**Triển khai:** `BusinessClaim`/`BusinessMember` entity mới (TypeORM, `apps/api/src/modules/
business/entities/`) + enum `ClaimStatus`/`ClaimReasonCode`/`MemberRole`/`BusinessClaimDecision` +
FSM thuần `business-claim.transition.ts` (submit/approve/reject/dispute/withdraw, 32 unit test ma
trận đầy đủ) + `BusinessClaimsRepository`/`BusinessMembersRepository` (row lock `FOR UPDATE`, `ON
CONFLICT` cho `uq_claim_pending`) + `BusinessClaimsService` (submit/list/getById/decide/withdraw,
transaction MỘT-KHỐI cho decide) + `BusinessClaimsController` (`POST /business-claims`, `POST
/business-claims/{id}/withdraw`, `GET /business-claims`, `GET /business-claims/{id}`, `POST
/business-claims/{id}/decide`) + migration `InitBusinessClaims`/`SeedBusinessPermissions` (self-
refusing `down()` khi có claim đã quyết định, cùng khuôn `InitModeration.down()`).

**ADR-019 tích hợp (bằng chứng sống, không phải suy luận):** `decide(approve)` gọi
`UserRolesRepository.assign({scopeType: managed, businessId: placeId}, manager)` — CÙNG cơ chế
`user_roles.business_id` mà ADR-019 M0.1–M0.3 đã đóng khoảng trống leo thang đặc quyền cho. E2e
`business-claims.e2e-spec.ts` xác nhận: owner vừa được cấp PATCH được place đã claim (200) qua
`PATCH /places/:id` (route/permission/resolver CÓ SẴN, không sửa gì), PATCH place khác bị từ chối
(403) — đúng như một `business_manager` thật đã được kiểm chứng ở ADR-019 M0.2.

**Xác nhận sống trên Postgres thật (2026-08-05):** migration apply → revert (self-refusing guard xác
nhận đúng khi có/không claim đã quyết định) → verify teardown 0 residue → reapply. Rollback drill
thật: throw có chủ đích SAU `business_members`+`user_roles`+`places.verification` NHƯNG TRƯỚC
`business_claims.status` commit — xác nhận CẢ BỐN đều rollback về baseline (không có state nửa vời),
throw + test tạm đã xoá ngay sau khi xác nhận, 0 residue. Full regression: BE unit 117 suite/1330
test, BE e2e 24 suite/206 test (bao gồm `business-claims.e2e-spec.ts` mới, 8 test), monorepo build/
typecheck/lint 6/6, `git diff --check` sạch, secret scan sạch (21 file kiểm tra). Chi tiết đầy đủ:
[ADR-015-BUSINESS-CLAIM-FOUNDATION-2026-08-05.md](../delivery/reports/ADR-015-BUSINESS-CLAIM-FOUNDATION-2026-08-05.md).

**Ngoài phạm vi milestone này (business.md §7 "còn mở" + Owner exclusion list, KHÔNG bắt đầu):**
quản lý Manager (gán/thu hồi, UC-B6), chuyển nhượng (transfer, UC-B7), dashboard chủ cơ sở (UC-B3/
B5), phản hồi review (UC-B4), thông báo, chế tài/sanction, số liệu/analytics, chuỗi nhiều chi nhánh,
ADR-008 đầy đủ (bảng `verifications`/`verification_events`/`verification_votes`).
