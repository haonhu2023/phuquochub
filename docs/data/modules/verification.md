# PhuQuocHub — Thiết kế Entity `Verification` (Xác minh dữ liệu)

> Tài liệu này chỉ **thiết kế** (không code). Bổ sung thực thể `Verification` để mọi dữ liệu (`Place`, `Contact`, `PriceHistory`) đều có trạng thái xác minh và vòng đời tin cậy rõ ràng. Gắn với [module-source.md](./source.md) (nguồn gốc) và [vision.md](../../overview/vision.md) §6 (trust model).
>
> **Verification Foundation: ĐÃ TRIỂN KHAI (2026-08-06).** §3-§5C (máy trạng thái + `verifications`/
> `verification_events`/`verification_votes` + CAS `lock_version` + cache §6) sống trên Postgres
> thật — submit/claim/verify/official/reject/vote (kèm tự động `community_verified` khi đủ ngưỡng
> phiếu) + job hết hạn (`expireOverdue()`). §5D permission giữ NGUYÊN như đã seed
> (`Verification.Verify`/`Reject` moderator-only; `Verification.Vote` MỚI seed, chỉ `local_guide`
> tường minh + kế thừa DAG). §10 mục 7 (trọng số phiếu theo vai trò) **vẫn còn mở** — milestone này
> dùng trọng số đồng nhất = 1 làm mặc định tạm thời, KHÔNG tự chốt bảng trọng số.
>
> **VERIFICATION SCHEDULER — Operational Enablement (2026-08-06).** §9 "Job hệ thống" nay CÓ hạ
> tầng lập lịch thật: `expireOverdue()` lô hoá + cursor keyset + ngân sách thời gian (không còn tải
> toàn bộ tập kết quả — điểm PIR đã nêu), gọi định kỳ qua `@nestjs/schedule` (mặc định mỗi 15 phút,
> UTC — `VERIFICATION_EXPIRY_CRON`), **TẮT theo mặc định** ở MỌI môi trường
> (`VERIFICATION_EXPIRY_SCHEDULE_ENABLED=true` để bật có chủ đích). Chống chạy chồng CHỈ trong một
> tiến trình API — nhiều replica cần khoá phân tán riêng (chưa xây, xem báo cáo). Manual runner:
> `npm run verification:expire [-- --dry-run]`. KHÔNG một state machine hết hạn thứ hai — vẫn CHÍNH
> XÁC `assertValidVerificationTransition`/`casUpdate`/`eventsRepo.append`/`syncTargetCache` đã có.
>
> **CLAIM → SOURCE → VERIFICATION INTEGRATION (2026-08-06) — ngoại lệ chuyển tiếp ĐÃ ĐÓNG:**
> `BusinessClaimsService.decide()` (ADR-015) KHÔNG còn ghi thẳng `places.verification_status`/
> `verified_at`. Approve claim nay tạo một `sources` (`type=business_owner`, `kind=platform_user`,
> gắn evidence của claim vào `metadata`) rồi gọi `VerificationsService.ensureOfficialFromClaim()` —
> đưa place tới `official` qua ĐÚNG MỘT luồng Verification (method `owner_claim`), CÙNG transaction
> với `business_members`/`user_roles`/`business_claims`. Bảng `verifications` giờ LÀ nguồn sự thật
> DUY NHẤT cho MỌI trạng thái xác minh tin cậy — không còn hai writer trên cùng một cột. Guard
> phòng vệ của ADR-008 CORRECTION (chặn `submit()` khi cache tin cậy không có dòng `verifications`
> sở hữu) vẫn còn TRONG MÃ NGUỒN nhưng chỉ còn bảo vệ DỮ LIỆU CŨ (được ghi trước milestone này) —
> mọi claim approve MỚI đều tạo dòng `verifications` tương ứng nên không còn tái tạo được tình
> huống đó qua đường hợp lệ.
>
> **CLAIM → SOURCE → VERIFICATION CORRECTION (2026-08-06)** — sau một post-implementation review
> read-only của milestone trên (1 Critical + 4 Major). Ba điểm chốt hành vi:
> **(a) Privacy:** `sources.metadata` của claim CHỈ chứa `{business_claim_id}` — KHÔNG sao
> `claim.evidence` vào đó, vì `GET /sources/:id` là `@Public()` và trả nguyên `metadata` (evidence
> CHỈ lộ qua `GET /business-claims/{id}` sau `Business.Verify`).
> **(b) No-op THẬT:** approve claim trên place ĐÃ `official` KHÔNG tạo `sources` mới, KHÔNG append
> event, KHÔNG ghi cache — `sources` tạo qua callback LƯỜI nên không còn dòng mồ côi, và audit trỏ
> tới `source_id` THẬT đang gắn (`sourceCreated=false`).
> **(c) Hạn:** claim-driven official dùng `expires_at = null` — KHÔNG áp mặc định +12 tháng của
> `POST /verifications/{id}/official`. Đây là chính sách TẠM THỜI có chủ đích: §7 nói hạn `official`
> để "buộc chủ cơ sở tái xác nhận", nhưng CHƯA có đường nào cho chủ cơ sở làm việc đó
> (`Verification.Verify` moderator-only; claim lại bị BR-B2 đẩy sang `disputed`), nên hạn 12 tháng sẽ
> khiến badge của cơ sở có chủ hợp lệ tự rơi xuống `expired` không ai phục hồi được ngoài moderator.
> Xét lại CÙNG lúc renewal UX được xây.
>
> **Chưa hiện thực dù §3.1 có mô tả:** auto-reject khi `dispute_count` cao, và demotion sau khi đã
> `community_verified`. Chi tiết:
> [ADR-008 §Tình trạng triển khai](../../99-decisions/ADR-008-verification-model.md)
> · [ADR-008-VERIFICATION-FOUNDATION-2026-08-06.md](../../delivery/reports/ADR-008-VERIFICATION-FOUNDATION-2026-08-06.md)
> · [ADR-008-CORRECTION-2026-08-06.md](../../delivery/reports/ADR-008-CORRECTION-2026-08-06.md)
> · [VERIFICATION-SCHEDULER-OPERATIONAL-ENABLEMENT-2026-08-06.md](../../delivery/reports/VERIFICATION-SCHEDULER-OPERATIONAL-ENABLEMENT-2026-08-06.md)
> · [CLAIM-SOURCE-VERIFICATION-INTEGRATION-2026-08-06.md](../../delivery/reports/CLAIM-SOURCE-VERIFICATION-INTEGRATION-2026-08-06.md)
> · [CLAIM-SOURCE-VERIFICATION-CORRECTION-2026-08-06.md](../../delivery/reports/CLAIM-SOURCE-VERIFICATION-CORRECTION-2026-08-06.md).

## 1. Nguyên tắc & phạm vi

Một mẩu dữ liệu có thể trải qua vòng đời xác minh:

`pending → verified → official / community_verified → expired → (pending lại) …`, hoặc bị `rejected`.

Yêu cầu:
- **Dùng chung** cho `Place`, `Contact`, `PriceHistory` (và mở rộng về sau).
- **KHÔNG polymorphic** (không cột `entity_type + entity_id` chung chung).
- Một **máy trạng thái** duy nhất, một lịch sử chuyển trạng thái duy nhất.

## 2. Vì sao KHÔNG polymorphic — và chọn cách nào

`source_attributions` ([module-source.md](./source.md)) dùng đa hình vì nó phải trỏ tới **rất nhiều loại** đối tượng và bản chất là ghi chú lỏng. `Verification` thì ngược lại: chỉ vài thực thể **cốt lõi**, cần **toàn vẹn tham chiếu chặt** (một xác minh phải xóa/cascade theo đúng dữ liệu nó xác minh). Đa hình sẽ mất FK thật, mất `ON DELETE CASCADE`, mất index riêng cho từng bảng.

| Phương án | FK thật? | Thêm thực thể mới | Đánh giá |
|---|---|---|---|
| **A. Exclusive arc** — 1 bảng `verifications`, các cột FK cụ thể *nullable* + `CHECK` đúng-một-khác-null | ✓ | Thêm 1 cột + sửa `CHECK` (migration nhỏ) | **✓ Chọn** — một entity dùng chung, một state machine, vẫn toàn vẹn |
| B. Bảng riêng mỗi loại — `place_verifications`, `contact_verifications`, `price_history_verifications` | ✓ | Thêm 1 bảng | Toàn vẹn mạnh nhất nhưng **nhân bản schema + logic** 3 lần |
| C. Polymorphic (`entity_type`,`entity_id`) | ✗ | Không sửa schema | **Bị loại** theo yêu cầu (mất FK/cascade) |

→ Chọn **A (exclusive arc)**: giữ **một** bảng `verifications` tái sử dụng (một máy trạng thái, một lịch sử) nhưng mỗi liên kết là **khóa ngoại thật**, được `CHECK` đảm bảo mỗi bản ghi xác minh **đúng một** đối tượng.

## 3. Máy trạng thái (State machine)

```
                 ┌─────────────┐
        gửi lại  │   PENDING   │◄────────── expired (yêu cầu xác minh lại)
      ┌─────────►│  (chờ duyệt)│◄────────── rejected (khiếu nại / sửa & gửi lại)
      │          └──┬───┬───┬──┘
      │             │   │   └───────────────► REJECTED  (sai / bị bác)
      │   moderator │   │ đủ ngưỡng cộng đồng
      │             ▼   ▼
      │   ┌──────────┐ ┌────────────────────┐
      │   │ VERIFIED │ │ COMMUNITY_VERIFIED │
      │   └────┬─────┘ └─────────┬──────────┘
      │        │ có nguồn        │ có nguồn chính thức
      │        │ chính thức      │
      │        ▼                 ▼
      │   ┌───────────────────────────┐
      │   │          OFFICIAL         │  (chủ cơ sở / website / chính quyền)
      │   └─────────────┬─────────────┘
      │  hết hạn        │ hết hạn / phát hiện sai
      └────────────── EXPIRED ◄────────┘ (hoặc → REJECTED)
```

### 3.1 Ý nghĩa từng trạng thái

| Trạng thái | Ý nghĩa | Ai/điều gì đặt |
|---|---|---|
| `pending` | Vừa gửi/nhập, chờ xác minh | Mặc định khi tạo dữ liệu |
| `verified` | Moderator đã kiểm chứng nội dung (mức cơ bản) | `method=moderator` |
| `official` | Xác minh dựa trên **nguồn chính thức** — mức tin cao nhất | `method=owner_claim / source_match`, **bắt buộc `source_id`** |
| `community_verified` | Đủ ngưỡng cộng đồng xác nhận, ít tranh chấp | `method=community_vote` (hệ thống tự chuyển) |
| `expired` | Xác minh đã hết hạn, cần làm lại (đặc biệt quan trọng cho giá) | `method=system_auto` khi quá `expires_at` |
| `rejected` | Bị bác: sai lệch, giả mạo, trùng lặp | moderator hoặc auto khi `dispute_count` cao |

### 3.2 Chuyển trạng thái hợp lệ

| Từ → Đến | Điều kiện |
|---|---|
| `pending → verified` | Moderator duyệt |
| `pending → official` | Có `source_id` chính thức (owner/website/government) |
| `pending → community_verified` | `confirm_count ≥ ngưỡng` và `dispute_count` dưới hạn |
| `pending → rejected` | Moderator bác / phát hiện giả |
| `verified → official`, `community_verified → official` | Bổ sung nguồn chính thức (nâng cấp) |
| `community_verified → verified` | Moderator can thiệp |
| `{verified, official, community_verified} → expired` | Quá `expires_at` |
| `{verified, official, community_verified} → rejected` | Phát hiện sai về sau |
| `expired → pending`, `rejected → pending` | Gửi lại để xác minh mới |

> Chuyển trạng thái **không sửa trực tiếp cột** — luôn đi qua nghiệp vụ và **ghi một dòng `verification_events`** (§5) để giữ vết đầy đủ.

## 4. Bảng `verifications` — Thực thể xác minh (exclusive arc)

Một bản ghi = trạng thái xác minh **hiện hành** của **một** mẩu dữ liệu.

| Cột | Kiểu | Null | Mô tả |
|---|---|---|---|
| `id` | UUID (PK) | ✗ | |
| `place_id` | UUID (FK → places) | ✓ | *Một trong ba* FK — exclusive arc |
| `contact_id` | UUID (FK → contacts) | ✓ | |
| `price_history_id` | UUID (FK → price_history) | ✓ | |
| `status` | ENUM | ✗ | `pending, verified, official, community_verified, expired, rejected` |
| `method` | ENUM | ✗ | `moderator, owner_claim, source_match, community_vote, system_auto` |
| `source_id` | UUID (FK → sources) | ✓ | Bằng chứng nguồn (**bắt buộc khi `official`**) |
| `confidence` | SMALLINT | ✓ | Độ tin của lần xác minh này 0–100 |
| `confirm_count` | INT default 0 | ✗ | **Cache dẫn xuất** — tổng trọng số phiếu `confirm` (nguồn sự thật ở `verification_votes` §5B) |
| `dispute_count` | INT default 0 | ✗ | **Cache dẫn xuất** — tổng trọng số phiếu `dispute` |
| `reason_code` | ENUM | ✓ | Mã lý do khi `rejected` (§4.1) — phục vụ báo cáo/tuân thủ |
| `verified_by` | UUID (FK → users) | ✓ | Moderator/chủ cơ sở thực hiện |
| `assigned_to` | UUID (FK → users) | ✓ | Moderator đang phụ trách (hàng đợi kiểm duyệt) |
| `assigned_at` | TIMESTAMPTZ | ✓ | Thời điểm nhận việc |
| `sla_due_at` | TIMESTAMPTZ | ✓ | Hạn xử lý theo SLA (job cảnh báo khi quá hạn) |
| `priority` | SMALLINT default 0 | ✗ | Ưu tiên hàng đợi (0 thường … 3 khẩn) |
| `note` | VARCHAR(300) | ✓ | Ghi chú xác minh |
| `rejected_reason` | VARCHAR(300) | ✓ | Diễn giải tự do khi `rejected` (kèm `reason_code`) |
| `valid_from` | TIMESTAMPTZ | ✓ | Bắt đầu hiệu lực |
| `expires_at` | TIMESTAMPTZ | ✓ | Hết hạn → job chuyển `expired` (null = không hết hạn) |
| `lock_version` | INT default 0 | ✗ | **Optimistic lock** — tăng mỗi transition, chống ghi đè đồng thời (§5C) |
| `created_by` | UUID (FK → users) | ✓ | Người khởi tạo (null nếu hệ thống) |
| `created_at / updated_at` | TIMESTAMPTZ | ✗ | |

**Ràng buộc exclusive arc — đúng một đối tượng, không polymorphic:**
```sql
ALTER TABLE verifications ADD CONSTRAINT chk_verif_one_target CHECK (
    (place_id         IS NOT NULL)::int
  + (contact_id       IS NOT NULL)::int
  + (price_history_id IS NOT NULL)::int = 1
);
```

**Ràng buộc trạng thái ↔ dữ liệu:**
```sql
-- official phải có nguồn
CHECK (status <> 'official' OR source_id IS NOT NULL);
-- rejected phải có mã lý do (reason_code); diễn giải tự do tùy chọn
CHECK (status <> 'rejected' OR reason_code IS NOT NULL);
```

**Mỗi mẩu dữ liệu chỉ một xác minh hiện hành** (FK thật cho phép partial-unique, điều đa hình không làm được):
```sql
CREATE UNIQUE INDEX uq_verif_place ON verifications(place_id)                 WHERE place_id IS NOT NULL;
CREATE UNIQUE INDEX uq_verif_contact ON verifications(contact_id)             WHERE contact_id IS NOT NULL;
CREATE UNIQUE INDEX uq_verif_price ON verifications(price_history_id)         WHERE price_history_id IS NOT NULL;
```

**Index khác:** `BTREE(status)`, `BTREE(expires_at) WHERE status IN ('verified','official','community_verified')` (job quét hết hạn), `BTREE(source_id)`, `BTREE(assigned_to, sla_due_at) WHERE status = 'pending'` (hàng đợi kiểm duyệt + SLA), `BTREE(sla_due_at) WHERE status = 'pending'` (job cảnh báo quá hạn).

> Vòng đời `expired → pending → …` **tái sử dụng cùng một dòng** (đổi `status`, đặt lại `expires_at`); toàn bộ lịch sử nằm ở `verification_events`.

### 4.1 `reason_code` — Từ điển mã lý do bác (Enterprise/compliance)

Mọi lần `rejected` phải gắn **mã chuẩn hóa** (báo cáo, phân tích chất lượng, khiếu nại); `rejected_reason` chỉ là diễn giải tự do bổ sung.

| `reason_code` | Ý nghĩa |
|---|---|
| `duplicate` | Trùng với dữ liệu/địa điểm đã có |
| `fabricated` | Bịa đặt / giả mạo bằng chứng |
| `outdated` | Thông tin đã cũ, không còn đúng |
| `insufficient_evidence` | Không đủ nguồn/bằng chứng để xác minh |
| `policy_violation` | Vi phạm chính sách nội dung |
| `wrong_target` | Xác minh gắn nhầm đối tượng |
| `other` | Khác (bắt buộc kèm `rejected_reason`) |

## 5. Bảng `verification_events` — Lịch sử chuyển trạng thái

Con của `verifications` qua **một FK duy nhất** (không polymorphic) — append-only, bất biến.

| Cột | Kiểu | Null | Mô tả |
|---|---|---|---|
| `id` | UUID (PK) | ✗ | |
| `verification_id` | UUID (FK → verifications) | ✗ | FK thật, `ON DELETE CASCADE` |
| `from_status` | ENUM | ✓ | Trạng thái trước (null nếu khởi tạo) |
| `to_status` | ENUM | ✗ | Trạng thái sau |
| `method` | ENUM | ✗ | Cách chuyển |
| `source_id` | UUID (FK → sources) | ✓ | Nguồn làm căn cứ lần chuyển này |
| `actor_id` | UUID (FK → users) | ✓ | Người/hệ thống thực hiện (null = system) |
| `note` | VARCHAR(300) | ✓ | |
| `created_at` | TIMESTAMPTZ | ✗ | |

**Index:** `BTREE(verification_id, created_at)`.

## 5B. Bảng `verification_votes` — Sổ phiếu cộng đồng (chống trùng, có kiểm toán)

`community_verified` **không** được cộng dồn số đếm thô: mỗi phiếu là **một bản ghi** trong sổ phiếu, `confirm_count`/`dispute_count` trên `verifications` chỉ là **cache dẫn xuất**. Đây là chuẩn Enterprise: **một người một phiếu**, có thể thu hồi, kiểm toán được, và cho phép **trọng số theo uy tín**.

| Cột | Kiểu | Null | Mô tả |
|---|---|---|---|
| `id` | UUID (PK) | ✗ | |
| `verification_id` | UUID (FK → verifications) | ✗ | FK thật, `ON DELETE CASCADE` |
| `user_id` | UUID (FK → users) | ✗ | Người bỏ phiếu |
| `vote` | ENUM | ✗ | `confirm`, `dispute` |
| `weight` | SMALLINT default 1 | ✗ | Trọng số theo uy tín/karma (Local Guide > Member) |
| `note` | VARCHAR(300) | ✓ | Lý do (nhất là khi `dispute`) |
| `created_at` | TIMESTAMPTZ | ✗ | |

**Ràng buộc & index:**
```sql
-- Một người một phiếu / một xác minh (đổi phiếu = UPDATE, không thêm dòng)
CREATE UNIQUE INDEX uq_vote_user ON verification_votes(verification_id, user_id);
CREATE INDEX idx_vote_verif ON verification_votes(verification_id);
```

> Khi thêm/đổi/thu hồi phiếu → tính lại `confirm_count = Σ weight(confirm)`, `dispute_count = Σ weight(dispute)` rồi so ngưỡng để (tự động) chuyển `community_verified`. Sổ phiếu là **nguồn sự thật**; hai cột đếm chỉ để đọc nhanh.

## 5C. Đồng thời, idempotency & bất biến (Enterprise)

- **Optimistic locking:** mọi chuyển trạng thái là compare-and-set trên `lock_version`
  (`UPDATE … SET status=…, lock_version=lock_version+1 WHERE id=:id AND lock_version=:v`).
  Ba tác nhân chạy song song — moderator, job cộng đồng, job hết hạn — không ghi đè lẫn nhau; thua cuộc thì đọc lại & thử lại.
- **Idempotency phiếu:** unique `(verification_id, user_id)` ở §5B khiến bỏ phiếu **idempotent** — gọi lại không nhân đôi.
- **Audit bất biến:** `verification_events` **append-only** (không `UPDATE`/`DELETE`); trạng thái hiện hành ở `verifications`, còn "đã từng ra sao" luôn tái dựng được từ sự kiện — phục vụ điều tra/tuân thủ.
- **Transaction:** một transition = **một giao dịch** gồm: cập nhật `verifications` (kèm `lock_version`) + `INSERT verification_events` + đồng bộ cache `verification_status`/`verified_at` trên entity đích. Không tách rời.

## 5D. Gác quyền theo RBAC cho từng transition

Chuyển trạng thái **không tùy tiện** — mỗi cạnh gắn một permission ([rbac.md](../../security/rbac.md)); AI/hệ thống **không bao giờ** tự đặt `official`.

| Transition | Tác nhân | Permission |
|---|---|---|
| `pending → verified` | Moderator | `Verification.Verify` |
| `pending → official`, `* → official` | Moderator / Business (đã claim) | `Verification.Verify` (+ `source_id` chính thức) |
| `pending → community_verified` | Hệ thống (đủ ngưỡng phiếu) | phiếu qua `Verification.Vote` |
| `* → rejected` | Moderator | `Verification.Reject` (+ `reason_code`) |
| nhận việc / đặt `assigned_to`, `priority` | Moderator | `Verification.Verify` (hàng đợi) |
| `* → expired` | Job hệ thống | (không quyền người dùng) |

## 6. Cache trạng thái trên thực thể (đọc nhanh)

Để lọc/hiển thị badge không phải join mỗi lần (giống `rating_avg`), mỗi bảng dữ liệu giữ **cache một chiều**, cập nhật khi có transition:

| Thêm vào `places` / `contacts` / `price_history` | Kiểu | Mô tả |
|---|---|---|
| `verification_status` | ENUM | Bản sao `verifications.status` hiện hành (`pending` mặc định) |
| `verified_at` | TIMESTAMPTZ | Thời điểm đạt trạng thái tin cậy gần nhất |

Trường `is_verified` cũ **đã bị loại bỏ hoàn toàn** (B5/[ADR-008](../../99-decisions/ADR-008-verification-model.md)) — hệ thống **chỉ** dùng cache `verification_status` (+ `verified_at`). Khi cần cờ nhị phân "đã xác minh?" thì **suy ra**: `verification_status IN ('verified','official','community_verified')`.

## 7. Cơ chế riêng của từng nhánh

- **`official`:** đi kèm `source_id` thuộc nhóm chính thức (`business_owner / official_website / government` theo [module-source.md](./source.md) §4.1). Thường có `expires_at` (vd 12 tháng) → buộc chủ cơ sở tái xác nhận, tránh dữ liệu "chính thức" hóa cũ.
- **`community_verified`:** hệ thống cộng **trọng số phiếu** từ sổ `verification_votes` (§5B) — `confirm_count`/`dispute_count` là cache dẫn xuất; đạt ngưỡng (mặc định **Σ weight(confirm) ≥ 5** và `dispute/confirm < 0.2`) thì tự chuyển. Phiếu của Local Guide/Verified Local có `weight` cao hơn Member. Đây là hiện thực trụ cột "Reddit" — đám đông xác thực, nhưng **có trọng số uy tín** và chống trùng phiếu.
- **`expired`:** dựa `expires_at`. **Đặc biệt hợp với `PriceHistory`:** một mức giá xác minh tại thời điểm T sẽ tự `expired` sau cửa sổ hiệu lực → UI hiển thị "giá cần cập nhật" thay vì tin mù.

## 8. Quan hệ với `Source` và `WikiRevision`

- **Verification ↔ Source:** `verifications.source_id` và `verification_events.source_id` cho biết **bằng chứng** đứng sau một trạng thái. `official` bắt buộc có nguồn; `community_verified` không cần nguồn ngoài mà dựa số phiếu. Hai thực thể bổ nhau: `Source` = *"dữ liệu đến từ đâu"*, `Verification` = *"đã được kiểm chứng tới mức nào"*.
- **Verification ↔ WikiRevision:** khi một `wiki_revision` được duyệt và làm thay đổi nội dung, xác minh liên quan có thể bị đặt lại `pending` (nội dung đổi thì phải xác minh lại) — nối qua nghiệp vụ, ghi vào `verification_events`.

## 9. Truy vấn mẫu

```sql
-- Địa điểm "đáng tin" để hiển thị nổi bật
SELECT p.* FROM places p
WHERE p.deleted_at IS NULL
  AND p.verification_status IN ('official','community_verified','verified');

-- Job quét hết hạn (chạy định kỳ)
UPDATE verifications
SET status = 'expired', updated_at = now()
WHERE status IN ('verified','official','community_verified')
  AND expires_at IS NOT NULL AND expires_at < now();
-- (kèm INSERT verification_events + cập nhật cache verification_status)
```

## 9B. Quan sát & vận hành (Observability)

Chỉ số theo dõi sức khỏe hệ xác minh (nguồn cho dashboard Moderator/Admin — [analytics.md](../../architecture/analytics.md)):

| Chỉ số | Tính từ | Ý nghĩa |
|---|---|---|
| Tồn đọng hàng đợi | `count(status='pending')` theo `priority` | Khối lượng chờ duyệt |
| Vi phạm SLA | `count(status='pending' AND sla_due_at < now())` | Việc quá hạn — cần điều phối |
| Tuổi trung bình chờ duyệt | `avg(now() - created_at) WHERE status='pending'` | Độ trễ kiểm duyệt |
| Tỉ lệ bác | `rejected / (verified+official+community_verified+rejected)` theo `reason_code` | Chất lượng nguồn đóng góp |
| Tồn đọng hết hạn | `count(status IN(verified,official,community_verified) AND expires_at < now())` | Dữ liệu "tin cậy" đã cũ chưa kịp hạ cấp |
| Tỉ lệ tranh chấp | `Σdispute / Σconfirm` | Mức xung đột cộng đồng |

## 10. Quyết định — đã chốt & còn mở

**Đã chốt (B5/ADR-008, cập nhật 2026-07-13):**
1. **Cache trên entity:** ✅ `verification_status` + `verified_at` trên `places`/`contacts`/`price_history` (đồng bộ khi transition); **bỏ hoàn toàn `is_verified`**.
2. **Ngưỡng `community_verified`:** ✅ **phiếu có trọng số uy tín** — mặc định `Σ weight(confirm) ≥ 5` và `dispute/confirm < 0.2`; sổ phiếu `verification_votes` chống trùng. Ngưỡng/trọng số cấu hình được.
3. **Hạn `official`:** ✅ mặc định `expires_at = +12 tháng`; **bắt buộc** cho `price_history` (giá phải tái xác nhận), **tùy chọn** cho `place`/`contact`.
4. **Chống ghi đè đồng thời:** ✅ optimistic `lock_version`; transition là một transaction.
5. **Truy vết bác:** ✅ `reason_code` chuẩn hóa (§4.1) + diễn giải tự do.

**Còn mở:**
6. **Thực thể mở rộng thứ tư** (vd `review`, `media`): chấp nhận thêm cột FK + sửa `CHECK` mỗi lần (đánh đổi của exclusive arc) — có ổn ở quy mô dự kiến không?
7. **Trọng số phiếu cụ thể theo vai trò/karma:** bảng trọng số chính xác (Member=1, Local Guide=?, Verified Local=?) chốt cùng [growth.md](../../product/growth.md).

---

*Tài liệu liên quan: [ADR-008](../../99-decisions/ADR-008-verification-model.md), [source.md](./source.md), [places.md](./places.md), [database.md](../database.md) §3.16–3.18, [api.md](../../api/api.md) §11.3, [rbac.md](../../security/rbac.md), [vision.md](../../overview/vision.md)*
