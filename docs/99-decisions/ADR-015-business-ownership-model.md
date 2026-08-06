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

**Ngoài phạm vi milestone Claim Foundation (business.md §7 "còn mở" + Owner exclusion list, KHÔNG
bắt đầu ở milestone đó):** quản lý Manager (gán/thu hồi, UC-B6) — **nay ĐÃ TRIỂN KHAI, xem dưới**;
chuyển nhượng (transfer, UC-B7) — **nay ĐÃ TRIỂN KHAI, xem dưới**; dashboard chủ cơ sở (UC-B3/B5),
phản hồi review (UC-B4), thông báo, chế tài/sanction, số liệu/analytics, chuỗi nhiều chi nhánh,
ADR-008 đầy đủ (bảng `verifications`/`verification_events`/`verification_votes`) — vẫn ngoài phạm vi.

---

**Business Manager Assignment/Revocation (UC-B6): ✅ ĐÃ TRIỂN KHAI (2026-08-05).** Milestone thứ
hai của ADR-015 trong repo này, ngay sau Claim Foundation. Tái sử dụng nguyên vẹn schema
`business_members` (không migration bảng/enum mới — chỉ seed permission). Owner-quyết định phạm
vi (2026-08-05):

1. **Permission CÓ hậu tố `.Managed`, không như M3.** `Business.Manager.Assign.Managed`/
   `Revoke.Managed` — khác `Business.Claim`/`Business.Verify` (M3, KHÔNG hậu tố). Đây chính là điểm
   rbac.md's chuỗi tên gốc (`Business.Manager.Assign` không hậu tố) mâu thuẫn với cơ chế ADR-019 D6
   (hậu tố quyết định scope class) — phát hiện ở bước đánh giá trước khi viết code, Owner xác nhận
   seed với hậu tố `.Managed` để đi đúng đường ADR-019, không theo nguyên văn chuỗi rbac.md.
2. **`Business.Edit.Managed` KHÔNG đụng tới** — vẫn để dành cho một Business Profile surface tương
   lai (nếu có), không endpoint nào ở milestone này cần nó.
3. **KHÔNG có kiểm tra ownership thủ công.** Actor authorization đi HOÀN TOÀN qua
   `@AuthorizationContext(resourceType:'place', resource:{from:'param',name:'id'})` +
   `IDENTITY_PLACE_RESOLVER` (0 truy vấn, cùng cơ chế `Place.Edit.Managed`) — PDP so khớp
   `business_id` của grant Managed với `id` route TRƯỚC KHI controller method chạy. Không một dòng
   "verify actor is owner" nào trong service — khác hẳn M3's self-verification (cần thủ công vì
   `Business.Verify` không hậu tố scope).
4. **`UserRolesRepository.revoke()` mở rộng thêm `businessId` (ngoài `manager` — Owner Decision 3
   chỉ định rõ manager tham số, `businessId` là bổ sung cần thiết để đúng nghĩa):** một user có thể
   là manager của NHIỀU cơ sở; thu hồi ở cơ sở A không được đụng grant ở cơ sở B. Tham số cũ (không
   truyền `businessId`) giữ hành vi CŨ cho `UsersService.revokeRole()` (thu hồi toàn bộ, dùng cho
   hành động admin gỡ hẳn một role) — không phá vỡ call site hiện có.

**Triển khai:** `BusinessManagersService` (assign/revoke, transaction MỘT-KHỐI, audit sau commit) +
`BusinessManagersController` (`POST /business/{id}/managers`, `DELETE /business/{id}/managers/
{userId}`) + `BusinessMembersRepository` mở rộng (`findActiveMembershipForUpdate` — khoá bất kỳ vai
trò hiệu lực nào của (place,user), dùng để chặn gán trùng VÀ xác nhận đúng dòng thu hồi;
`createManager`/`revokeMembership`) + migration `SeedBusinessManagerPermissions` (2 permission mới,
grant CHỈ `business_owner`).

**Xác nhận sống trên Postgres thật (2026-08-05):** owner gán manager → `business_members(role=
manager)` + `user_roles(business_manager, managed, business_id)` tạo đúng, audit
`business.manager_assigned`. Cùng owner gán manager cho cơ sở KHÁC → 403 (ADR-019 cross-business
isolation, không cần code phân quyền mới). Người vừa được gán manager tự gán manager khác → 403
(đúng permission chain — chỉ `business_owner` giữ `Business.Manager.Assign.Managed`). Revoke →
`business_members.revoked_at` + `user_roles` đều thu hồi, và quyền Managed mất hiệu lực NGAY (manager
vừa bị thu hồi PATCH place → 403 tức thì). User là manager ở HAI cơ sở, revoke ở cơ sở A không đụng
grant ở cơ sở B (đúng lý do `businessId` được thêm vào `revoke()`). Migration apply → revert → xác
nhận 0 residue → reapply. Full regression: BE unit 119 suite/1341 test (từ 117/1330), BE e2e 25
suite/216 test (từ 24/206, gồm `business-managers.e2e-spec.ts` mới, 10 test), monorepo build/
typecheck/lint 12/12, `git diff --check` sạch, secret scan sạch (11 file). Không chạy drill rollback
sống riêng cho milestone này — cơ chế transaction giống hệt (`dataSource.transaction()`) đã được
chứng minh sống ở Claim Foundation; review mã nguồn xác nhận cả hai lệnh ghi trong mỗi method
(`assign()`/`revoke()`) đều nhận đúng `manager` dùng chung. Chi tiết đầy đủ:
[ADR-015-BUSINESS-MANAGER-ASSIGNMENT-2026-08-05.md](../delivery/reports/ADR-015-BUSINESS-MANAGER-ASSIGNMENT-2026-08-05.md).

**Ngoài phạm vi milestone này:** chuyển nhượng (transfer, UC-B7) — **nay ĐÃ TRIỂN KHAI, xem dưới**;
dashboard, phản hồi review, thông báo, số liệu/analytics, chuỗi nhiều chi nhánh,
`Business.Edit.Managed`, ADR-008 đầy đủ.

---

**Business Ownership Transfer (UC-B7): ✅ ĐÃ TRIỂN KHAI (2026-08-06).** Milestone thứ ba của
ADR-015 trong repo này, ngay sau Manager Assignment/Revocation. Tái sử dụng nguyên vẹn schema
`business_members`/`user_roles` (không migration bảng/enum mới — chỉ seed permission). Owner-quyết
định phạm vi (2026-08-06):

1. **Biểu diễn transfer = mô hình sẵn có, KHÔNG bảng `business_transfers` mới.** business.md §7 mục
   5 (câu hỏi mở từ Claim Foundation) chốt dứt điểm: revoke owner cũ + insert owner mới trên
   `business_members` (`claim_id=null`, giống manager) + đồng bộ scoped `business_owner` trên
   `user_roles` (revoke cũ, assign mới), ghi đầy đủ vào `audit_logs`
   (`business.ownership_transferred`, context gồm `business_id`/`from_user_id`/`to_user_id`/
   `initiated_by`/`reason`/id của cả bốn thay đổi liên quan — membership cũ/mới, role-grant cũ/mới).
2. **Permission CÓ hậu tố `.Managed`, cùng lớp Manager Assignment.** `Business.Transfer.Managed` —
   KHÔNG seed/dùng chuỗi không hậu tố `Business.Transfer` mà rbac.md ghi, cùng lý do ADR-019 D6 đã
   buộc sửa ở M3.5 (Manager Assignment).
3. **Hành động trực tiếp của owner hiện tại — KHÔNG moderator, KHÔNG bước chấp thuận của owner
   mới.** Có hiệu lực NGAY sau khi transaction commit. Manager giữ nguyên — transfer KHÔNG đụng tới
   bất kỳ dòng `business_members(role='manager')` nào.
4. **Transaction MỘT-KHỐI, thứ tự cố định:** khoá + xác nhận owner hiệu lực hiện tại → xác nhận
   actor CHÍNH LÀ owner đó → xác nhận target user tồn tại → xác nhận target CHƯA có vai trò hiệu lực
   nào tại cơ sở này (bao gồm cả đang là manager — 409, không ngầm định "thăng chức" thu hồi vai trò
   manager của họ) → revoke membership cũ → revoke scoped role cũ (CHỈ businessId này) → insert
   membership mới → assign scoped role mới → commit → audit SAU commit.

**Triển khai:** `BusinessTransferService` (transaction một khối, audit sau commit) +
`BusinessTransferController` (`POST /business/{id}/transfer`) + migration
`SeedBusinessTransferPermission` (1 permission mới, grant CHỈ `business_owner`) + `business-member.
mapper.ts` mới (hợp nhất response shape `business_members`, dùng chung cho cả Manager Assignment lẫn
Transfer, thay `business-manager.mapper.ts` cũ) + `UsersRepository.findById()`/`UserRolesRepository.
findActive()` mở rộng tham số `manager` tuỳ chọn (đọc TRONG transaction của caller, cùng quy ước
`assign()`/`revoke()` đã có).

**Xác nhận sống trên Postgres thật (2026-08-06):** owner chuyển nhượng → `business_members` owner cũ
`revoked_at` được set, owner mới insert (`claim_id=null`), `user_roles` scoped grant cũ revoke/mới
assign đúng `business_id`, quyền Managed của owner cũ mất hiệu lực NGAY (PATCH place → 403 tức thì
sau transfer, 200 ngay trước đó) và owner mới có hiệu lực NGAY (200). Manager giữ nguyên (PATCH place
vẫn 200 sau transfer). Owner sở hữu HAI cơ sở, transfer một cơ sở KHÔNG đụng scoped grant ở cơ sở
kia. Cross-business isolation giữ nguyên qua ADR-019 (owner cơ sở A transfer cơ sở B → 403, không
cần code phân quyền mới). Target đang là manager tại cơ sở này → 409, vai trò manager giữ nguyên.
Rollback drill thật: throw có chủ đích SAU cả bốn lệnh ghi (revoke membership cũ, revoke role cũ,
insert membership mới, assign role mới) NHƯNG TRƯỚC commit — xác nhận CẢ BỐN đều rollback về
baseline (owner cũ vẫn còn quyền Managed, owner mới không có quyền gì, không audit row nào được ghi),
throw + test tạm đã xoá ngay sau khi xác nhận, 0 residue. Migration apply → revert → verify 0 residue
→ reapply. Full regression: BE unit 121 suite/1354 test (từ 119/1341), BE e2e 26 suite/225 test (từ
25/216, gồm `business-transfer.e2e-spec.ts` mới, 9 test), monorepo build/typecheck/lint 12/12, `git
diff --check` sạch, secret scan sạch. Live HTTP walkthrough riêng qua server thật (không chỉ
supertest) xác nhận toàn bộ hành vi trên qua HTTP + SQL trực tiếp, dọn sạch 0 residue. Chi tiết đầy
đủ: [ADR-015-BUSINESS-OWNERSHIP-TRANSFER-2026-08-06.md](../delivery/reports/ADR-015-BUSINESS-OWNERSHIP-TRANSFER-2026-08-06.md).

**Ngoài phạm vi milestone này:** dashboard chủ cơ sở (UC-B3/B5), phản hồi review (UC-B4), thông báo,
chế tài/sanction, số liệu/analytics, chuỗi nhiều chi nhánh, `Business.Edit.Managed`, ADR-008 đầy đủ.

---

**CẬP NHẬT (2026-08-06) — CLAIM → SOURCE → VERIFICATION INTEGRATION đóng Owner Decision 1 của Claim
Foundation phía trên.** Owner Decision 1 (dòng 64-70) ghi "Claim approved → ghi thẳng
`places.verification_status = 'official'` + `places.verified_at = now()`. ADR-008 vẫn hoãn" — ĐÚNG
tại thời điểm viết (2026-08-05), giữ NGUYÊN VĂN ở trên vì đó là quyết định THẬT đã áp dụng lúc đó,
KHÔNG sửa lại. Kể từ milestone ADR-008 CLAIM → SOURCE → VERIFICATION INTEGRATION (2026-08-06),
`BusinessClaimsService.decide()` KHÔNG còn ghi cache đó trực tiếp — approve claim tạo một `sources`
(`type=business_owner`) rồi gọi `VerificationsService.ensureOfficialFromClaim()`, đi qua ĐÚNG MỘT
luồng Verification (bảng `verifications`/`verification_events` ĐÃ migrate từ ADR-008 Verification
Foundation, 2026-08-06) CÙNG transaction với `business_members`/`user_roles`. `Business.Verify`
(mục 2) và `dispute` tự động (mục 3) KHÔNG đổi — chỉ bước ghi cache cuối cùng của nhánh approve đổi
đường đi. Chi tiết đầy đủ:
[CLAIM-SOURCE-VERIFICATION-INTEGRATION-2026-08-06.md](../delivery/reports/CLAIM-SOURCE-VERIFICATION-INTEGRATION-2026-08-06.md)
· [ADR-008 §Tình trạng triển khai](ADR-008-verification-model.md).
