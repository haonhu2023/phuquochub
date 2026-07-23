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
