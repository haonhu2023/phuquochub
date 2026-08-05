# PhuQuocHub — Thiết kế Entity `Business` (Sở hữu cơ sở)

> Thiết kế **dữ liệu** cho lớp Business: cho phép chủ cơ sở **claim** một `Place`, được xác minh và **quản lý** trang chính thức. Mô hình **Place-centric** (không có bảng `businesses`) — chốt ở [ADR-015](../../99-decisions/ADR-015-business-ownership-model.md). Lớp sản phẩm: [product/business.md](../../product/modules/business.md).
>
> **Business Claim Foundation (Claim Decision Workflow): ĐÃ TRIỂN KHAI (2026-08-05).** §2–§4 (schema
> `business_claims`/`business_members` + máy trạng thái claim) sống trên Postgres thật — claim
> submission (UC-B1) + moderator decision (UC-B2) + owner-membership/scoped `business_owner` grant
> khi approved. §5 mục "Verification liên kết" hiện thực bằng **cache column** `places.
> verification_status`/`verified_at` (ADR-008 §Decision mục 3), KHÔNG phải bảng `verifications` đầy
> đủ — ADR-008's state machine riêng (`verifications`/`verification_events`/`verification_votes`)
> **vẫn hoãn**. §5 mục RBAC hiện thực bằng permission MỚI `Business.Verify` (tách biệt
> `Verification.Verify`). §7 mục "Còn mở" (transfer, chuỗi/thương hiệu) và §3 "Quản lý nhân sự"
> (Manager assign/revoke), §3 tính năng Dashboard/phản hồi review/analytics **vẫn chưa triển khai**.
> Chi tiết: [ADR-015 §Tình trạng triển khai](../../99-decisions/ADR-015-business-ownership-model.md)
> · [ADR-015-BUSINESS-CLAIM-FOUNDATION-2026-08-05.md](../../delivery/reports/ADR-015-BUSINESS-CLAIM-FOUNDATION-2026-08-05.md).

## 1. Nguyên tắc & phạm vi

- **"Business" = một `Place` đã claim** + lớp sở hữu; **không** tạo thực thể `businesses` riêng (ADR-015, Model A).
- Hai entity: **`business_claims`** (yêu cầu nhận quyền, có máy trạng thái) và **`business_members`** (sở hữu/ủy quyền hiệu lực).
- `business_id` ở toàn hệ = **`places.id`** của Place đã claim; các cột `business_id`/`owner_type='business'` đánh dấu **provenance chính thức** (official) tách khỏi **cộng đồng**.
- Xác minh Official **tái dùng** entity `Verification` ([verification.md](./verification.md), ADR-008) — không có state tin cậy riêng cho Business.

## 2. Bảng `business_claims` — Yêu cầu nhận quyền (state machine + audit)

| Cột | Kiểu | Null | Mô tả |
|---|---|---|---|
| `id` | UUID (PK) | ✗ | |
| `place_id` | UUID (FK → places) | ✗ | Cơ sở được claim |
| `requester_id` | UUID (FK → users) | ✗ | Người gửi yêu cầu |
| `evidence` | JSONB | ✗ | Tham chiếu bằng chứng (giấy phép/hóa đơn/ảnh mặt tiền/xác minh SĐT) — **riêng tư, chỉ Moderator** |
| `status` | ENUM | ✗ | `pending, approved, rejected, disputed, withdrawn` |
| `reviewer_id` | UUID (FK → users) | ✓ | Moderator xử lý |
| `reason_code` | ENUM | ✓ | Khi `rejected`: `insufficient_evidence, duplicate, fraud, wrong_target, other` |
| `decision_note` | VARCHAR(300) | ✓ | Diễn giải quyết định |
| `decided_at` | TIMESTAMPTZ | ✓ | Thời điểm duyệt/bác |
| `created_at / updated_at` | TIMESTAMPTZ | ✗ | |

**Ràng buộc & index:**
```sql
-- Chống spam: một người chỉ một claim đang chờ / một cơ sở
CREATE UNIQUE INDEX uq_claim_pending ON business_claims(place_id, requester_id) WHERE status = 'pending';
CREATE INDEX idx_claim_queue ON business_claims(place_id, status);
-- rejected phải có mã lý do
CHECK (status <> 'rejected' OR reason_code IS NOT NULL);
```

## 3. Bảng `business_members` — Sở hữu & ủy quyền hiệu lực

| Cột | Kiểu | Null | Mô tả |
|---|---|---|---|
| `id` | UUID (PK) | ✗ | |
| `place_id` | UUID (FK → places) | ✗ | Cơ sở |
| `user_id` | UUID (FK → users) | ✗ | Thành viên |
| `role` | ENUM | ✗ | `owner, manager` |
| `claim_id` | UUID (FK → business_claims) | ✓ | Nguồn gốc claim (với owner) |
| `granted_by` | UUID (FK → users) | ✓ | Người cấp (Moderator cho owner; Owner cho manager) |
| `granted_at` | TIMESTAMPTZ | ✗ | |
| `revoked_at` | TIMESTAMPTZ | ✓ | Thu hồi (soft) — null = còn hiệu lực |

**Ràng buộc nghiệp vụ cưỡng chế ở DB (partial unique):**
```sql
-- BR-B2: một Owner hiệu lực / cơ sở
CREATE UNIQUE INDEX uq_member_owner ON business_members(place_id)
    WHERE role = 'owner' AND revoked_at IS NULL;
-- một người một vai trò hiệu lực / cơ sở
CREATE UNIQUE INDEX uq_member_active ON business_members(place_id, user_id)
    WHERE revoked_at IS NULL;
CREATE INDEX idx_member_user ON business_members(user_id) WHERE revoked_at IS NULL;
```

> **Owner hiệu lực** của một Place = `business_members` với `role='owner'` và `revoked_at IS NULL`. Thu hồi/chuyển nhượng = đặt `revoked_at` (giữ lịch sử) rồi thêm dòng mới — **không xóa cứng**.

## 4. Máy trạng thái claim

```
                ┌───────────┐
   gửi + evidence│  PENDING  │
       ─────────►└─────┬─────┘
                       │ Moderator (Business.Verify)
        ┌──────────────┼───────────────┐
        │ approve      │ reject         │ (đã có owner)
        ▼              ▼                ▼
   ┌─────────┐   ┌──────────┐     ┌───────────┐
   │APPROVED │   │ REJECTED │     │ DISPUTED  │──► Moderator/Admin phân xử
   └────┬────┘   └──────────┘     └─────┬─────┘        │
        │ tạo business_members(owner)   └──────────────┘ → APPROVED | REJECTED
        │ + Verification(place = official, source=business_owner)
        ▼
   (requester rút trước khi duyệt → WITHDRAWN)
```

| Trạng thái | Ý nghĩa | Đặt bởi |
|---|---|---|
| `pending` | Đã gửi, chờ xác minh | requester (`Business.Claim`) |
| `approved` | Đã duyệt → cấp quyền + Official | Moderator (`Business.Verify`) |
| `rejected` | Bị bác (kèm `reason_code`) | Moderator |
| `disputed` | Cơ sở đã có owner → tranh chấp | hệ thống/Moderator |
| `withdrawn` | Requester tự rút | requester |

## 5. Liên kết với các entity khác

- **Verification (ADR-008):** khi `approved`, nghiệp vụ tạo/nâng `verifications(place_id)` lên `official` với `method=owner_claim`, `source_id` trỏ nguồn `business_owner` ([verification.md §7](./verification.md)). Không lưu cờ Official riêng trên Business.
- **RBAC (rbac.md):** duyệt claim → gán `business_owner` qua `user_roles(scope_type='managed', business_id=place_id)`. `business_members` là **sổ sở hữu nghiệp vụ**; `user_roles` là **phân quyền** — đồng bộ khi cấp/thu hồi. Manager = `user_roles` role `business_manager` scope Managed cùng `business_id`.
- **Media (ADR-009) / Contacts (ADR-005):** nội dung **chính thức** của cơ sở dùng `media.business_id = place_id` và `contacts(owner_type='business', owner_id=place_id)`; nội dung **cộng đồng** dùng `place_id`/`owner_type='place'`.
- **Provenance (source.md):** dữ liệu do chủ sửa gắn `source=business_owner` (BR-B9) để tách khỏi cộng đồng.

## 6. Truy vấn mẫu

```sql
-- Owner hiệu lực của một cơ sở
SELECT user_id FROM business_members
WHERE place_id = :id AND role = 'owner' AND revoked_at IS NULL;

-- Các cơ sở một người đang quản lý (owner/manager)
SELECT place_id, role FROM business_members
WHERE user_id = :uid AND revoked_at IS NULL;

-- Hàng đợi claim chờ duyệt
SELECT * FROM business_claims WHERE status = 'pending' ORDER BY created_at;
```

## 7. Quyết định — đã chốt & còn mở

**Đã chốt (Wave 1/ADR-015):**
1. Place-centric, không bảng `businesses`.
2. `business_id = places.id`; giữ arc official/community cho media & contacts.
3. BR-B2 cưỡng chế bằng partial unique.
4. Official qua Verification, không state riêng.

**Còn mở:**
5. **Chuyển nhượng (transfer):** biểu diễn bằng revoke owner cũ + insert owner mới (đề xuất) — có cần bảng lịch sử `business_transfers` riêng cho audit pháp lý không, hay đủ với `business_members` + audit log?
6. **Chuỗi/thương hiệu nhiều chi nhánh:** để Wave 5 (brand-link nhẹ) nếu phát sinh nhu cầu thật.

---

*Tài liệu liên quan: [ADR-015](../../99-decisions/ADR-015-business-ownership-model.md), [database.md §3.19–3.20](../database.md), [verification.md](./verification.md), [rbac.md](../../security/rbac.md), [api.md §18](../../api/api.md), [contribution.md WF-05](../../workflow/contribution.md), [product/business.md](../../product/modules/business.md)*
