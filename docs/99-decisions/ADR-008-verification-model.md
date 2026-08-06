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

**Ngoại lệ chuyển tiếp (transitional exception, xem Owner quyết định mục 1) — ĐÃ SỬA LẠI SAU PIR
(2026-08-06):** `BusinessClaimsService.decide()` (ADR-015) tiếp tục là một writer ĐỘC LẬP của
`places.verification_status`/`verified_at`, tách biệt khỏi bảng `verifications` mới.

Bản ghi đầu tiên của mục này mô tả tình trạng đó là "tạm thời, có chủ đích, không phải khiếm khuyết"
và dừng ở đó. **Đánh giá sau triển khai (PIR) cho thấy cách diễn đạt ấy SAI ở phần quan trọng nhất:**
việc hoãn tích hợp đúng là có chủ đích, nhưng HỆ QUẢ của nó thì KHÔNG hề được kiểm soát. Hai writer
cùng sở hữu một cột được phơi công khai (`places.verification_status` trả về trên route `@Public`
qua `toPlaceCard`), và hai đường đi THẬT đều chạm tới được chỉ bằng thao tác hợp lệ:

- **(a) Hạ cấp âm thầm:** cơ sở được duyệt claim (cache `official`, KHÔNG dòng `verifications`) →
  bất kỳ moderator nào gọi `POST /verifications` → tạo dòng `pending` → cache bị ghi đè
  `official` → `pending`. Cơ sở mất badge công khai vì một thao tác không liên quan.
- **(b) Phân kỳ vĩnh viễn:** cơ sở đã có dòng `verifications` (vd `verified`) → duyệt claim → cache
  bị ép thành `official` trong khi entity vẫn `verified`. `uq_verif_place` giữ dòng đó tồn tại mãi,
  và job hết hạn đọc entity nên cache `official` KHÔNG BAO GIỜ hết hạn. Hai giá trị mâu thuẫn vĩnh viễn.

E2e ban đầu chỉ chứng minh trường hợp lành tính (place mới tinh, `count = 0`) rồi khái quát hoá —
không hề kiểm chứng hai thứ tự trên.

**ADR-008 CORRECTION (2026-08-06) đã đóng cả hai đường bằng một GUARD PHÒNG VỆ HAI CHIỀU** (KHÔNG
phải tích hợp — phạm vi tích hợp giữ nguyên là milestone riêng):

- `BusinessClaimsService.decide(approve)` chỉ ghi cache khi cơ sở CHƯA có dòng `verifications`. Nếu
  đã có, dòng đó là nguồn sự thật của cache và claim KHÔNG ghi đè. Claim vẫn approve bình thường
  (ownership/`business_members`/`user_roles` không đổi); kết quả ghi vào audit context
  `verification_cache_written` để không âm thầm.
- `VerificationsService.submit()` từ chối (409) khi target đang mang trạng thái TIN CẬY do writer
  khác đặt mà chưa có dòng `verifications`. KHÔNG "nhận" cache làm trạng thái khởi tạo, vì `official`
  đòi `source_id` (CHECK `ck_verif_official_source`) mà claim không hề sinh `sources` — nhận vào sẽ
  vi phạm chính ADR-008.

**Giới hạn còn lại, nêu thẳng:** hệ quả của guard (a) là cơ sở đã duyệt claim **chưa thể đưa vào hàng
đợi xác minh** cho tới khi milestone tích hợp Business Claim → Source → Verification hoàn thành. Đây
là một giới hạn chức năng THẬT, được chấp nhận có ý thức để đổi lấy việc không làm hỏng badge công
khai; nó KHÔNG phải là trạng thái cuối cùng mong muốn. Cả hai chiều nay đều có e2e chứng minh.

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

*(Lưu ý sửa sau PIR: câu "0 residue" ở trên đúng với `verifications`/`verification_events`/
`verification_votes`/`users`/`places` — những bảng đã thực sự kiểm — nhưng KHÔNG đúng với `sources`:
teardown e2e có một mệnh đề không bao giờ khớp nên mọi `sources` do suite tạo đều rò rỉ. Đã sửa và
chứng minh 0 residue trên 11 bảng ở ADR-008 CORRECTION, xem
[ADR-008-CORRECTION-2026-08-06.md](../delivery/reports/ADR-008-CORRECTION-2026-08-06.md).)*

**Ngoài phạm vi milestone này:** tích hợp Business Claim → Source → Verification (ngoại lệ chuyển
tiếp ở trên), thực thể mở rộng thứ tư (review/media — §10 mục 6 còn mở), bảng trọng số phiếu theo
vai trò/karma cụ thể (§10 mục 7 còn mở), job hết hạn/công cụ vận hành thật (dashboard §9B, SLA
alerting) — **job hết hạn nay ĐÃ có hạ tầng lập lịch, xem VERIFICATION SCHEDULER dưới đây; dashboard/
SLA alerting vẫn ngoài phạm vi** —, mọi milestone Business/Place khác.

---

**ADR-008 CORRECTION: ✅ ĐÃ TRIỂN KHAI (2026-08-06).** Milestone sửa lỗi hẹp, chạy ngay sau đánh giá
sau triển khai (PIR). KHÔNG mở rộng phạm vi: KHÔNG tích hợp Claim→Source, KHÔNG scheduler, KHÔNG job
đối soát, KHÔNG reassign hàng đợi, KHÔNG metrics, KHÔNG auto-reject/demotion, KHÔNG API mới. Không
migration nào (chỉ sửa mã + test + tài liệu; schema không đổi).

Sửa đúng bốn hạng mục PIR:

1. **C1 (Critical)** — guard phòng vệ hai chiều chặn hai writer ghi giá trị `verification_status`
   mâu thuẫn; chi tiết ở mục "Ngoại lệ chuyển tiếp" phía trên.
2. **F1 (Major)** — `expiresAt`/`reasonCode`/`rejectedReason` không còn sống sót sang trạng thái
   không thuộc về chúng: gửi lại xoá cả ba; `verify`/`official` xoá metadata bác bỏ; `reject` xoá
   cửa sổ hiệu lực. Lỗi thật đã đóng: `official(expires=T)` → `expired` → gửi lại → `verify` từng
   cho ra dòng `verified` mang `expires_at` QUÁ HẠN và bị job hạ cấp ngay lần chạy kế tiếp.
   E2e mới bắt thêm một lỗi cấp hai trong lúc sửa: `submit()` trả response dựng từ entity TRƯỚC
   update nên vẫn phơi giá trị cũ dù DB đã đúng — đã sửa để trả đúng những gì vừa ghi.
3. **T1 (Major)** — hai `submit()` đồng thời cùng target: vi phạm `uq_verif_*` (23505) nay thành
   409 thay vì 500, dùng chung helper `isUniqueViolation` (tách từ `BusinessClaimsService` sang
   `common/db/unique-violation.ts`, bắt ĐÚNG constraint đã lường trước, lỗi khác vẫn nổi nguyên trạng).
4. **X1 (Major)** — teardown e2e dọn `sources`/`price_history` theo id đã theo dõi (mệnh đề cũ không
   bao giờ khớp và `.catch()` che mất). Đã dọn 12 dòng rò rỉ sẵn có và chứng minh 0 residue trên 11
   bảng bằng truy vấn thật sau khi chạy — không chỉ tuyên bố.

Chi tiết đầy đủ: [ADR-008-CORRECTION-2026-08-06.md](../delivery/reports/ADR-008-CORRECTION-2026-08-06.md).

---

**VERIFICATION SCHEDULER — Operational Enablement: ✅ ĐÃ TRIỂN KHAI (2026-08-06).** Milestone hẹp,
độc lập, chạy sau CORRECTION. Mục tiêu DUY NHẤT: đưa `expireOverdue()` (đã có từ Foundation) vào
vận hành production một cách an toàn — KHÔNG mở rộng phạm vi: KHÔNG tích hợp Claim→Source, KHÔNG
reassign hàng đợi, KHÔNG bộ lọc hàng đợi mới, KHÔNG job đối soát cache, KHÔNG metrics/dashboard,
KHÔNG auto-reject/demotion, KHÔNG API endpoint mới, KHÔNG một state machine hết hạn thứ hai. Không
migration nào (schema không đổi).

Đóng đúng khoảng trống PIR đã nêu ("the expiry path is unbounded"):

1. **Lô hoá + cursor keyset.** `VerificationsRepository.findOverdueTrustedBatch()` thay
   `listOverdueTrusted()` cũ (tải TOÀN BỘ kết quả) — cùng khuôn keyset
   `MediaRepository.findOrphanCleanupCandidates()`, sắp `(expires_at, id)`, cursor TEXT chính xác
   (không dùng `Date` JS — mất độ chính xác dưới mili-giây, rủi ro fetch lặp).
2. **Ngân sách thời gian + giới hạn lô.** `VerificationExpiryOptions` (`batchSize`/`maxBatches`/
   `maxExecutionMs`) — kiểm ngân sách GIỮA các dòng, KHÔNG BAO GIỜ giữa chừng một dòng (dòng đã bắt
   đầu transaction luôn chạy tới hoàn tất). Mặc định 100 dòng/lô, 50 lô, 5 phút — CÙNG con số
   `MediaCleanupService` đã dùng.
3. **`VerificationExpirySummary` có cấu trúc** (`scanned`/`eligible`/`expired`/`conflicts`/`errors`/
   `batchesRun`/`timeBudgetExceeded`/`oldest+newestProcessedExpiresAt`/`durationMs`) — CAS thua HOẶC
   dòng không còn hợp lệ cho `expire` (ai đó vừa transition) đếm vào `conflicts`, KHÔNG fatal; lỗi
   hệ thống KHÔNG lường trước đếm vào `errors`, dòng đó bị bỏ qua, các dòng CÒN LẠI vẫn tiếp tục.
4. **Lịch chạy thật.** `VerificationExpiryScheduler` đăng ký cron job ĐỘNG (biểu thức từ
   `ConfigService`, không thể dùng `@Cron()` tĩnh) qua `@nestjs/schedule`/`cron`
   (`ScheduleModule.forRoot()` MỘT LẦN ở `AppModule` — "một cơ chế lập lịch duy nhất"). Mặc định
   TẮT ở MỌI môi trường (`VERIFICATION_EXPIRY_SCHEDULE_ENABLED=true` để bật có chủ đích — KHÔNG suy
   luận ngầm từ `NODE_ENV=production`). Cadence mặc định mỗi 15 phút, UTC.
5. **Chống chạy chồng TRONG MỘT tiến trình** — cờ `isRunning` (instance, singleton) trên
   `VerificationExpiryScheduler`; lần gọi chồng bị BỎ QUA (log WARN, KHÔNG lỗi), khoá LUÔN được giải
   phóng ở `finally` kể cả khi `expireOverdue()` throw. **Nhiều replica API là mối lo triển khai
   RIÊNG, ghi rõ, KHÔNG âm thầm giả định** — không có khoá phân tán (Redis/DB advisory lock) nào
   được xây; mỗi replica bật lịch sẽ chạy job độc lập (không hỏng toàn vẹn dữ liệu nhờ CAS, nhưng
   lãng phí tài nguyên).
6. **Manual runner** (`npm run verification:expire [-- --dry-run|--batch-size=N|--max-batches=N|
   --max-execution-ms=N]`) — cùng khuôn `clean-orphan-media.ts`
   (`NestFactory.createApplicationContext()`, không HTTP server, không lịch). `--dry-run` dùng
   CHUNG truy vấn lô + tiêu chí đủ điều kiện, chỉ bỏ qua bước ghi — KHÔNG một state machine dry-run
   riêng. Exit code khác 0 CHỈ khi `errors > 0` (lỗi hệ thống) — `conflicts` là race bình thường,
   KHÔNG coi là thất bại lần chạy.

**Xác nhận sống trên Postgres thật (2026-08-06):** 5 dòng đủ điều kiện + `batchSize=2` → đúng 3 lô,
cả 5 expired, đúng MỘT `verification_event`/dòng (không xử lý hai lần). `maxBatches` dừng ĐÚNG số lô
dù còn dòng đủ điều kiện, dòng chưa tới lượt vẫn nguyên `official` (không mất). Ngân sách thời gian
cực nhỏ → dừng sớm giữa các dòng, không dòng nào dở dang. Chạy lại lần hai trên tập đã xử lý hết →
0 event mới (idempotent). **CAS race THẬT** (không mock): `POST /verifications/{id}/reject` qua
HTTP và `expireOverdue()` chạy ĐỒNG THỜI qua `Promise.all` trên CÙNG một dòng — đúng MỘT bên thắng,
đúng MỘT `verification_event` được ghi, KHÔNG mất mát/nhân đôi. Hai lần gọi `runTick()` chồng nhau
trong tiến trình → đúng MỘT lần chạy, lần còn lại bị bỏ qua. **Manual runner chạy như CLI THẬT**
(tiến trình con `node -r ts-node/register`, không phải gọi hàm nội bộ) — `--dry-run` không ghi gì
lên dòng của test, chạy thật sau đó expire đúng dòng. 0 residue chứng minh qua truy vấn trực tiếp
sau khi chạy (không chỉ tuyên bố). Full regression: BE unit 127 suite/1485 test (từ 125/1462 tại
CORRECTION — không tính lại số cũ, xem báo cáo cho số chính xác), BE e2e 28 suite/249 test (+2 file
mới: `verification-scheduler.e2e-spec.ts` 8 test + cập nhật `verifications.e2e-spec.ts`), monorepo
build/typecheck/lint 12/12, `git diff --check` sạch, secret scan sạch, 0 residue.

**Ghi chú trung thực về e2e song song:** khi Jest chạy NHIỀU file e2e song song (mặc định), CLI
runner test (có cửa sổ thời gian ~24s do chi phí khởi động subprocess) có thể va chạm với một lần
chạy `expireOverdue()` THẬT ở file KHÁC (`verifications.e2e-spec.ts` cũng gọi job này) — vì
`expireOverdue()` quét TOÀN CỤC theo đúng thiết kế (một job nền thật, không lọc theo test). Đã sửa
bằng cách đối chiếu TRỰC TIẾP qua SQL trên dòng của CHÍNH test thay vì tin số liệu tổng hợp toàn cục
trong stdout CLI. Bộ e2e đầy đủ xác nhận SẠCH khi chạy `--runInBand` (28/28, 249/249) — khuyến nghị
cho CI khi có mặt file scheduler này. Đây là đặc tính hạ tầng test dùng chung một Postgres sống,
KHÔNG phải khiếm khuyết ở mã sản phẩm (đã chứng minh bằng chính test CAS-race/overlap ở trên, chạy
concurrency THẬT và đúng).

Chi tiết đầy đủ: [VERIFICATION-SCHEDULER-OPERATIONAL-ENABLEMENT-2026-08-06.md](../delivery/reports/VERIFICATION-SCHEDULER-OPERATIONAL-ENABLEMENT-2026-08-06.md).

**Vẫn ngoài phạm vi sau milestone này (có chủ đích, KHÔNG bỏ sót):** tích hợp Business Claim →
Source → Verification; khoá phân tán đa-replica; job/công cụ đối soát cache; reassign/unassign hàng
đợi + bộ lọc "chưa ai nhận"/quá hạn SLA; auto-reject/demotion khi dispute cao; bảng trọng số phiếu
theo vai trò/karma; metrics/dashboard §9B thật.

**Vẫn còn mở sau CORRECTION (đã biết, có chủ đích, KHÔNG thuộc phạm vi lần sửa này):** tích hợp
Business Claim → Source → Verification (và giới hạn kèm theo: cơ sở đã duyệt claim chưa vào được
hàng đợi xác minh); auto-reject/demotion khi tỉ lệ dispute cao (§3.1 mô tả nhưng chưa hiện thực);
scheduler thật cho `expireOverdue()` (chưa có lịch chạy thì KHÔNG có gì tự hết hạn); job/công cụ đối
soát cache; unassign/reassign hàng đợi và bộ lọc "chưa ai nhận"/quá hạn SLA; batching cho
`expireOverdue()`; tính lại `confirm_count`/`dispute_count` khi user bị xoá; metrics §9B.

---

**CLAIM → SOURCE → VERIFICATION INTEGRATION: ✅ ĐÃ TRIỂN KHAI (2026-08-06).** Milestone hẹp, chạy
sau VERIFICATION SCHEDULER. Mục tiêu DUY NHẤT nêu thẳng bởi Owner: xoá bỏ ngoại lệ chuyển tiếp mà
Owner Decision mục 1 (Foundation) và CORRECTION để lại — MỌI trạng thái xác minh tin cậy phải xuất
phát từ hệ Verification; `BusinessClaimsService` KHÔNG còn là writer của
`places.verification_status`/`verified_at`. KHÔNG mở rộng phạm vi: KHÔNG dashboard, KHÔNG metrics,
KHÔNG công cụ đối soát, KHÔNG thông báo, KHÔNG phản hồi review, KHÔNG analytics, KHÔNG cải tiến
transfer, KHÔNG bộ lọc hàng đợi, KHÔNG auto-reject, KHÔNG dispute heuristics, KHÔNG đổi scheduler,
KHÔNG đổi business ownership, KHÔNG đổi ADR-019.

**Phase 1 (đọc + kiểm kê mọi writer)** xác nhận đúng MỘT writer cần thay: nhánh approve của
`BusinessClaimsService.decide()` (khối guard C1 từ CORRECTION). `SourcesService.verifyAttribution()`'s
`SourceAttribution.verifiedAt` được xác nhận là khái niệm KHÔNG liên quan (thuộc
`source_attributions`, không thuộc hệ exclusive-arc `verifications`) — không đụng tới.

**Phase 4 (đánh giá tác động migration) kết luận KHÔNG cần migration nào**, chứng minh SỐNG trên
Postgres TRƯỚC khi viết bất kỳ dòng mã nào: `VerificationMethod` đã có `owner_claim` (seed từ
Foundation, chưa từng dùng tới trước milestone này), `SourceType` đã có `business_owner` (reliability
85 mặc định) và `SourceKind` đã có `platform_user`, bảng `sources` đã có đủ mọi cột cần (
`author_user_id`, `metadata` jsonb, ...). Không file migration nào được thêm — `git status` xác nhận.

**Triển khai, theo hướng tách hàm tái dùng (`VerificationsService`):** `transition()` tách thành
wrapper mở transaction + `transitionCore(manager, current, actorId, build)` (CAS + append event +
đồng bộ cache, KHÔNG transaction, KHÔNG audit); build callback của `official()` tách thành
`buildOfficialTransition(current, dto, actorId, method, manager)` tham số hoá theo
`VerificationMethod` — CÙNG một đường đi cho cả HTTP moderator (`method=moderator`) VÀ claim
(`method=owner_claim`); nhánh tạo/gửi lại của `submit()` tách thành
`createPendingVerification()`/`resubmitVerification()`. Hàm công khai MỚI
`ensureOfficialFromClaim(placeId, {sourceId, actorId, note}, manager)` hợp thành các hàm trên với
bốn nhánh theo trạng thái dòng `verifications` hiện có của place: chưa có dòng nào → tạo pending rồi
transition; `expired`/`rejected` → gửi lại (resubmit) rồi transition; `pending`/`verified`/
`community_verified` → transition THẲNG sang `official` (TÁI DÙNG dòng đó, không tạo dòng thứ hai);
đã `official` rồi → no-op, trả nguyên trạng. Nhận `EntityManager` từ BÊN NGOÀI, KHÔNG tự mở
transaction/audit — caller (`BusinessClaimsService.decide()`) cung cấp cả hai, nên toàn bộ quyết
định (business_members + user_roles + business_claims + sources + verifications +
verification_events + cache) VẪN là một transaction nguyên tử duy nhất, CÙNG bảo đảm như trước
milestone này.

Nhánh approve của `BusinessClaimsService.decide()` giờ tạo một `sources`
(`type=business_owner`/`kind=platform_user`/`author_user_id=requester`/`metadata={business_claim_id,
evidence}`) rồi gọi `ensureOfficialFromClaim()` thay vì ghi `places.verification_status`/`verifiedAt`
trực tiếp. Guard C1 cũ (chỉ ghi cache khi CHƯA có dòng `verifications`) không còn là đường ghi đang
hoạt động; guard đối xứng ở `submit()` (từ chối 409 khi cache tin cậy không có dòng `verifications`
sở hữu) VẪN GIỮ NGUYÊN trong mã nguồn nhưng chỉ còn ý nghĩa bảo vệ DỮ LIỆU CŨ — mọi claim approve MỚI
đều tạo dòng `verifications` tương ứng nên tình huống đó không còn tái tạo được qua đường hợp lệ.
`BusinessClaimsService`'s constructor đổi `VerificationsRepository` → `VerificationsService` +
`SourcesRepository`; `SourcesModule` thêm vào imports của `BusinessModule`.

**Xác nhận sống trên Postgres thật (2026-08-06):** approve claim qua HTTP thật tạo đúng MỘT `sources`
+ đúng MỘT `verifications` (`method=owner_claim`, `status=official`, `source_id` khớp) + đúng hai
`verification_events` (null→pending, pending→official); `places.verification_status`/`verified_at`
khớp; audit `business.claim_approved`'s context mang `{sourceId, verificationId,
verificationStatus}`. Approve claim trên một place ĐÃ có dòng `verified` → dòng đó ĐƯỢC TÁI DÙNG
(transition thẳng sang `official`, `method` đổi thành `owner_claim`, event thứ ba được ghi) thay vì
tạo dòng thứ hai — xác nhận bằng đối chiếu id dòng VÀ `uq_verif_place` vẫn giữ nguyên (không vi phạm
UNIQUE). Rollback drill thật: throw có chủ đích SAU business_members + user_roles + sources +
verifications + verification_events NHƯNG TRƯỚC `business_claims.status` commit — xác nhận CẢ NĂM
đều rollback về baseline cùng lúc, throw + test tạm đã xoá ngay sau khi xác nhận. Hai e2e trước đó
khẳng định hành vi ghi cache trực tiếp CŨ (`verifications.e2e-spec.ts`) đã được VIẾT LẠI để khẳng
định hành vi tích hợp MỚI (không xoá — đổi đúng theo hành vi mới của từng nhánh). 0 residue `sources`
chứng minh qua truy vấn trực tiếp sau khi chạy suite, không chỉ tuyên bố. Full regression: BE unit
127 suite/1491 test, BE e2e 28 suite/249 test (cùng số file/test với Scheduler — không thêm file e2e
mới, mở rộng đúng hai file có sẵn), monorepo build/typecheck/lint 12/12. Chi tiết đầy đủ:
[CLAIM-SOURCE-VERIFICATION-INTEGRATION-2026-08-06.md](../delivery/reports/CLAIM-SOURCE-VERIFICATION-INTEGRATION-2026-08-06.md).

**Vẫn ngoài phạm vi sau milestone này (có chủ đích, KHÔNG bỏ sót):** dashboard chủ cơ sở, metrics,
công cụ đối soát cache/vote-count, thông báo, phản hồi review, số liệu/analytics, cải tiến transfer,
bộ lọc hàng đợi mới, auto-reject/demotion khi dispute cao, bảng trọng số phiếu theo vai trò/karma,
khoá phân tán đa-replica, metrics/dashboard §9B thật, mọi milestone Business/Place khác.
