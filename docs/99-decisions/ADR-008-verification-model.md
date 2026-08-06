# ADR-008 — Mô hình xác minh (Verification Model)

## Status
**Accepted** — 2026-07-12. Supersedes cờ `is_verified` boolean (trên `places`/`contacts`/`price_history`).
**Revised 2026-07-13** — bổ sung *enterprise hardening* (sổ phiếu `verification_votes`, optimistic `lock_version`, `reason_code`, hàng đợi/SLA, gác RBAC) — xem §Decision mục 6–10.

## Context
- Trust model của nền tảng cần **nhiều mức tin cậy** (verified / official / community_verified) + **hết hạn** (giá "official" cũ phải tái xác nhận), không thể diễn đạt bằng một boolean `is_verified`.
- `verification.md` đã thiết kế `verifications` (máy trạng thái + **exclusive arc**) + `verification_events` (audit trail); nhưng `places.md`/tài liệu còn giữ `is_verified` boolean song song ⇒ **hai nguồn sự thật, không nhất quán**.
- FK targets (`contacts` B3/ADR-005, `price_history` B4/ADR-006) nay đã phê duyệt → gỡ blocker để chốt cache.

## Decision
Chuẩn hóa Verification theo hướng **Enterprise**, **loại bỏ hoàn toàn `is_verified`**:

1. **Một thực thể trạng thái** `verifications` (exclusive arc → `places`/`contacts`/`price_history`, đúng-một qua `CHECK`), máy trạng thái `pending → verified → official/community_verified → expired | rejected` — [database.md §3.16](../data/database.md), [verification.md §3–§4](../data/modules/verification.md).
2. **Audit trail bất biến** `verification_events` (append-only, FK `ON DELETE CASCADE`) — mọi chuyển trạng thái ghi một dòng.
3. **Cache đọc nhanh** trên mỗi entity: `verification_status` (ENUM) + `verified_at` (TIMESTAMPTZ) — **thay hoàn toàn `is_verified`**.
4. **"Đã xác minh?"** là giá trị **suy ra**: `verification_status IN ('verified','official','community_verified')` — không lưu cờ nhị phân riêng.
5. `official` bắt buộc `source_id`; `expires_at` → job tự chuyển `expired` (**mặc định +12 tháng**, bắt buộc cho `price_history`).

**Enterprise hardening (2026-07-13):**

6. **Sổ phiếu cộng đồng** `verification_votes` (UNIQUE `(verification_id, user_id)`) là **nguồn sự thật** cho `community_verified`: một người một phiếu, có `weight` theo uy tín, thu hồi/đổi được, kiểm toán được; `confirm_count`/`dispute_count` chỉ là **cache dẫn xuất**. Ngưỡng mặc định `Σ weight(confirm) ≥ 5` và `dispute/confirm < 0.2`.
7. **Optimistic concurrency** bằng `lock_version` (compare-and-set) — moderator, job cộng đồng và job hết hạn chạy song song không ghi đè nhau; mỗi transition là **một transaction** (update `verifications` + insert `verification_events` + đồng bộ cache entity).
8. **Mã lý do bác** `reason_code` chuẩn hóa (`duplicate/fabricated/outdated/insufficient_evidence/policy_violation/wrong_target/other`) — `CHECK(status<>'rejected' OR reason_code IS NOT NULL)`; phục vụ báo cáo & khiếu nại.
9. **Hàng đợi kiểm duyệt + SLA:** `assigned_to`/`assigned_at`/`sla_due_at`/`priority` trên `verifications` biến `pending` thành work-queue có SLA & observability (tồn đọng, vi phạm SLA, tỉ lệ bác).
10. **Gác quyền RBAC theo transition:** `verify/official → Verification.Verify`, `reject → Verification.Reject`, phiếu → `Verification.Vote`, `expired` → job hệ thống; AI **không bao giờ** đặt `official`.

## Consequences
### Positive
- **Một nguồn sự thật** cho tin cậy (verification_status), hết mâu thuẫn `is_verified`.
- Diễn đạt đủ **đa mức + hết hạn + lịch sử**; audit trail phục vụ điều tra/tuân thủ (Enterprise).
- Cache giữ đọc nhanh (badge/lọc/ranking) mà vẫn toàn vẹn qua state machine.
- Đồng bộ Search: ranking dùng `verification_status` thay `is_verified`.
- **Chống gian lận phiếu** (sổ `verification_votes` + UNIQUE) và **kiểm toán đầy đủ** (events append-only) — đạt chuẩn Enterprise/compliance.
- **Vận hành đo được:** hàng đợi + SLA + `reason_code` cho dashboard Moderator/Admin.

### Negative / đánh đổi
- Cache `verification_status`/`verified_at` **và** `confirm_count`/`dispute_count` phải **đồng bộ** khi có transition/phiếu — chi phí nhất quán.
- Exclusive arc: thêm loại thực thể xác minh mới = thêm cột FK + sửa `CHECK`.
- Thêm bảng `verification_votes` + logic optimistic-lock/transaction — schema & nghiệp vụ phức tạp hơn boolean (đánh đổi chấp nhận để đạt Enterprise).

## Alternatives Considered
- **Giữ `is_verified` boolean:** đơn giản nhưng không diễn đạt đa mức/hết hạn/lịch sử; là nguồn sự thật thứ hai. → **Loại.**
- **Không cache (luôn join `verifications`):** đơn giản, luôn đúng, nhưng chậm cho badge/lọc/ranking quy mô lớn. → Không chọn (giữ cache).
- **Polymorphic `verifications`:** mất FK/cascade — trái yêu cầu toàn vẹn của xác minh (khác `contacts`/`price_history` vốn lỏng). → **Loại** (đã chọn exclusive arc).

## References
- [database.md §3.16–3.18](../data/database.md) (verifications/verification_events/verification_votes) · [verification.md](../data/modules/verification.md) (state machine, CHECK, index, votes ledger §5B, concurrency §5C, RBAC §5D) · [erd.md §2](../data/erd.md) · [api.md §11.3](../api/api.md) (queue & actions) · [rbac.md](../security/rbac.md) (Verification.Verify/Reject/Vote) · [search.md §3/§5/§7](../architecture/search.md) (ranking signal) · [source.md](../data/modules/source.md) (provenance)
- Related ADR: [ADR-003](ADR-003-no-polymorphic.md) (exclusive arc) · [ADR-005](ADR-005-contact-entity.md) · [ADR-006](ADR-006-price-history.md) (cache `verification_status`)
- Nguồn: Blocker B5 trong rà soát docs/ chuẩn bị Prisma. Quyết định 2026-07-12; enterprise hardening 2026-07-13 (Chief Data Architect).

## Tình trạng triển khai (Implementation Status)

*(Mục này CHỈ ghi lại tiến độ triển khai — KHÔNG sửa bất kỳ nội dung quyết định nào ở §Decision/
§Alternatives/§Consequences. Cùng quy ước ADR-015/ADR-018/ADR-019's milestone banner.)*

**Verification Foundation: ✅ ĐÃ TRIỂN KHAI (2026-08-06).** Lần triển khai ADR-008 ĐẦU TIÊN trong
repo này — trước milestone này, `verifications`/`verification_events`/`verification_votes` chưa
từng được migrate; cơ chế xác minh DUY NHẤT là cache `verification_status`/`verified_at` trên
`places`/`contacts`/`price_history` (đã tồn tại từ `InitPlaces`, dùng làm placeholder trực tiếp bởi
`BusinessClaimsService.decide()`, ADR-015 Claim Foundation).

**Read-only assessment trước khi viết code** phát hiện hai điểm cần Owner quyết định trước khi bắt
đầu:

1. `BusinessClaimsService.decide()` (ADR-015) đã ghi thẳng `places.verificationStatus=official` mà
   KHÔNG qua bất kỳ `verifications` row nào — nếu milestone này xây `verifications` như nguồn sự
   thật DUY NHẤT mà không xử lý gì thêm, mọi business claim được duyệt sẽ tạo ra một place `official`
   VĨNH VIỄN không có `verifications`/`verification_events` tương ứng (không bằng chứng nguồn, không
   audit trail domain-level) — đúng vấn đề "hai nguồn sự thật" mà chính ADR-008 muốn xoá bỏ. Sửa
   triệt để đòi hỏi hoặc tạo `sources` row từ `business_claims.evidence` (đụng Source module ngoài
   phạm vi) hoặc nới lỏng CHECK `official` bắt buộc `source_id` (mâu thuẫn trực tiếp §Decision mục 5).
2. `verification.md` §5D tự mâu thuẫn với `rbac.md` §6: §5D liệt kê actor `* -> official` là
   "Moderator / Business (đã claim)" qua `Verification.Verify`, nhưng ma trận năng lực `rbac.md` ghi
   Biz Owner = ✗ cho đúng permission đó (chỉ Moderator/Admin/Super có), và `SeedRbac` gốc CHỈ grant
   `moderator`.

**Owner quyết định phạm vi (2026-08-06):**

1. **`BusinessClaimsService.decide()` KHÔNG bị đụng tới ở milestone này.** Tiếp tục ghi thẳng
   `places.verificationStatus`/`verifiedAt` khi approve claim. KHÔNG tạo `verifications` row, KHÔNG
   tạo `verification_events`, KHÔNG synthesize `sources` row từ `business_claims.evidence`, KHÔNG nới
   lỏng CHECK `official` bắt buộc `source_id`. Bảng `verifications` ở milestone này **KHÔNG PHẢI**
   nguồn sự thật cho luồng ADR-015 claim — chỉ là nguồn sự thật cho các luồng xác minh mà CHÍNH
   milestone này triển khai. Tích hợp Business Claim → Source → Verification là việc **tương lai
   riêng**, cần một quyết định mô hình Source cho claim trước (Ngoại lệ chuyển tiếp — xem dưới).
2. **Mô hình permission GIỮ NGUYÊN.** `Verification.Verify`/`Verification.Reject` vẫn moderator-only,
   KHÔNG hậu tố scope (đã seed từ `SeedRbac`, không sửa). KHÔNG cấp cho `business_owner`, KHÔNG tạo
   `Verification.Verify.Managed`/`Verification.Reject.Managed`. `verification.md`'s "Moderator /
   Business (đã claim)" đọc là kết quả NGHIỆP VỤ khái niệm (ADR-015 đã đạt được qua đường
   `Business.Verify` + claim-approval riêng của nó) — KHÔNG phải một permission grant theo nghĩa đen.
3. **`Verification.Vote` seed MỚI**, grant CHỈ `local_guide` (đúng role rbac.md nêu tường minh) —
   `moderator`/`administrator`/`super_administrator` kế thừa qua DAG THẬT (`role_parents`:
   `moderator -> local_guide`, đã tồn tại từ `SeedRbac`), không giả định "và cao hơn" theo tên role.

**Triển khai:** entity `Verification`/`VerificationEvent`/`VerificationVote`
(`apps/api/src/modules/verifications/`) + máy trạng thái thuần `verification.transition.ts`
(6 action: submit/verify/official/communityVerify/reject/expire, ưu tiên bảng §3.2 khi khác sơ đồ
ASCII §3) + `VerificationsRepository`/`VerificationEventsRepository`/`VerificationVotesRepository`
(CAS `lock_version` qua `casUpdate()`, KHÔNG `FOR UPDATE` — đúng tinh thần optimistic locking §5C) +
`VerificationsService` (submit/list/getById/listEvents/claim/verify/official/reject/vote/
expireOverdue) + `VerificationsController` (`POST/GET /verifications`, `GET /verifications/{id}
[/events]`, `POST /verifications/{id}/{claim,verify,official,reject,votes}`) + migration
`InitVerifications` (3 bảng mới, TÁI SỬ DỤNG enum `verification_status` sẵn có từ `InitPlaces` —
KHÔNG tạo type mới, tự-chối `down()` nếu đã có `verification_events` thật) + `SeedVerificationPermissions`
(seed `Verification.Vote`, grant `local_guide`). `PlacesRepository`/`ContactsRepository`/
`PricesRepository` mỗi bên thêm `updateScalars()` (Contacts/Prices — Places đã có từ ADR-015) để
`VerificationsService` đồng bộ cache đúng entity đích (exclusive arc).

**Điểm khác biệt so với thiết kế gốc, có chủ đích:**
- `assigned_to`/`priority`/`sla_due_at` (nhận việc) triển khai như field update thuần — KHÔNG ghi
  `verification_events` (không phải status transition, đúng §5D liệt kê tách biệt "nhận việc" khỏi
  các dòng transition khác).
- Trọng số phiếu ĐỒNG NHẤT = 1 cho mọi voter — verification.md §10 mục 7 tự nhận đây là tham số
  **CÒN MỞ** ("Member=1, Local Guide=?, Verified Local=? chốt cùng growth.md"); cột `weight` vẫn tồn
  tại đầy đủ, sẵn sàng cho một bảng trọng số thật khi growth.md chốt — milestone này KHÔNG tự bịa số.
- Job hết hạn (`expireOverdue()`) là một phương thức thuần, KHÔNG có hạ tầng lập lịch nào
  (@nestjs/schedule/BullMQ/cron) — cùng quy ước `InventoryHoldsRepository.expireOverdueHolds()` đã
  có trong repo; một job thật (sprint sau) chỉ cần gọi định kỳ.
- SLA mặc định +48h khi không truyền `sla_due_at` — giả định tường minh (ADR-008 không chỉ định).

**Ngoại lệ chuyển tiếp (transitional exception, xem Owner quyết định mục 1):**
`BusinessClaimsService.decide()` (ADR-015) tiếp tục là một writer ĐỘC LẬP của
`places.verification_status`/`verified_at`, hoàn toàn tách biệt khỏi bảng `verifications` mới. Một
place được duyệt qua claim sẽ có `verification_status=official` NHƯNG `verifications` KHÔNG có dòng
nào cho place đó — xác nhận sống bằng e2e (`verifications.e2e-spec.ts`, test cuối). Đây là trạng thái
TẠM THỜI, có chủ đích, đã được Owner xác nhận — KHÔNG phải một khiếm khuyết bỏ sót. Đóng khoảng cách
này (Business Claim → Source → Verification) là việc tương lai riêng.

**Xác nhận sống trên Postgres thật (2026-08-06):** submit → claim → verify → official (nguồn sai
nhóm → 422, nguồn đúng nhóm + mặc định `expires_at` +12 tháng) → reject (thiếu `reason_code` → 400
DTO validation) → gửi lại (TÁI SỬ DỤNG cùng dòng, không insert mới) — toàn bộ vòng đời xác nhận qua
HTTP thật + SQL trực tiếp, cache `places.verification_status`/`verified_at` đồng bộ ĐÚNG lúc (bao
gồm: `verified_at` KHÔNG bị đụng khi reject/expire — chỉ set khi ĐẾN trạng thái tin cậy). Exclusive
arc xác nhận với CẢ `place` LẪN `contact` target. 5 `local_guide` bỏ phiếu `confirm` (trọng số 1 mỗi
người) → tự động `community_verified` NGAY LẬP TỨC trong cùng request phiếu thứ 5, `verification_events`
ghi `method=community_vote actor_id=null`; đổi phiếu (cùng user) → idempotent, không nhân đôi
`confirm_count`. `expireOverdue()` chuyển đúng dòng đã quá `expires_at` sang `expired`, để nguyên
dòng chưa quá hạn. Rollback drill thật: throw có chủ đích SAU CAS `verifications` + INSERT
`verification_events` + UPDATE cache `places` NHƯNG TRƯỚC commit — xác nhận CẢ BA đều rollback về
baseline, throw + test tạm đã xoá ngay sau khi xác nhận, 0 residue. Migration apply → revert (tự-chối
đúng khi có `verification_events` thật) → verify 0 residue → reapply khớp chính xác. Full regression:
BE unit 125 suite/1448 test, BE e2e 27 suite/237 test (gồm `verifications.e2e-spec.ts` mới, 12 test),
monorepo build/typecheck/lint 12/12, `git diff --check` sạch, secret scan sạch. Chi tiết đầy đủ:
[ADR-008-VERIFICATION-FOUNDATION-2026-08-06.md](../delivery/reports/ADR-008-VERIFICATION-FOUNDATION-2026-08-06.md).

**Ngoài phạm vi milestone này:** tích hợp Business Claim → Source → Verification (ngoại lệ chuyển
tiếp ở trên), thực thể mở rộng thứ tư (review/media — §10 mục 6 còn mở), bảng trọng số phiếu theo
vai trò/karma cụ thể (§10 mục 7 còn mở), job hết hạn/công cụ vận hành thật (dashboard §9B, SLA
alerting), mọi milestone Business/Place khác.
