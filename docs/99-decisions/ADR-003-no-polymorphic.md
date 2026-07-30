# ADR-003 — Không dùng quan hệ đa hình khi cần toàn vẹn (No Polymorphic)

## Status
**Accepted** — 2026-07-13. Chính thức hóa nguyên tắc **de-facto** đã áp trong ADR-005/006/008/009/014/016 (trước đây các ADR này Accepted nhưng dựa trên ADR-003 còn Proposed — nay gỡ nghịch lý quản trị). Cập nhật kèm mở rộng arc `media` (thêm `event_id`, Wave 2).

## Context
- Nền tảng có hai nhu cầu tham chiếu khác nhau: **(a)** tham chiếu **chặt, ít loại chủ, cần cascade** (media→chủ, verification→đối tượng); **(b)** tham chiếu **lỏng, nhiều loại chủ, tái dùng đa module, giữ audit** (nguồn, liên hệ, giá, phiên bản, kiểm toán).
- Đa hình gốc (`owner_type/owner_id` không FK) **mất** FK thật, `ON DELETE CASCADE`, index riêng, và khó biểu diễn trong ORM.

## Problem
Chốt **khi nào** dùng exclusive arc (FK thật) và **khi nào** cho phép đa hình, để mọi entity theo một quy tắc nhất quán trước khi sinh ORM.

## Decision
**Mặc định: exclusive arc (FK thật + `CHECK` đúng-một). Đa hình chỉ là ngoại lệ có kiểm soát.**

1. **Exclusive arc** khi cần **toàn vẹn chặt + cascade + ít loại chủ:**
   - `media` — arc **5 nhánh**: `place_id | review_id | post_id | business_id | event_id` (đúng-một; `event_id` thêm ở Wave 2 — [ADR-009](ADR-009-media-model.md), [database.md §3.5](../data/database.md)).
   - `verifications` — arc: `place_id | contact_id | price_history_id` ([ADR-008](ADR-008-verification-model.md)).
   - Đặc điểm: FK thật, `ON DELETE CASCADE`/partial-unique riêng từng nhánh, `CHECK` tổng số not-null = 1.

2. **Đa hình (`entity_type/entity_id`, không FK cứng)** — **ngoại lệ** khi **nhiều loại chủ + tái dùng đa module + bản chất audit/ghi chú lỏng, không cascade:**
   - `source_attributions`, `wiki_revisions`, `contacts` (`owner_type/owner_id`), `price_history`, `audit_logs`.
   - `bookings`, `availability_slots` (thêm 2026-07-30, Booking/Availability & Inventory Foundation — cùng nguyên tắc, `entity_type` giới hạn `hotel|restaurant|tour|event|transport` qua `BOOKABLE_ENTITY_TYPES` ở tầng app, không ENUM DB; xem [docs/data/modules/booking.md](../data/modules/booking.md), [docs/data/modules/availability.md](../data/modules/availability.md)).
   - Toàn vẹn `entity_id` cưỡng chế ở **tầng ứng dụng**.

3. **Không polymorphic khi có thể exclusive arc.** Thêm loại chủ cho arc = thêm 1 FK nullable + sửa `CHECK` (migration nhỏ) — chấp nhận đánh đổi này để giữ FK thật.

4. **Quy ước casing discriminator (B-3, chốt 2026-07-13):** mọi giá trị discriminator đa hình (`entity_type`, `owner_type` trên `contacts`, `price_history`, `source_attributions`, `wiki_revisions`, `audit_logs`) dùng **`lowercase snake_case`** thống nhất (`place, business, hotel, restaurant, tour, event, review, post, user, place_field, wiki_revision, business_service, real_estate…`). **Cấm UPPERCASE.** *(Value-enum như `contacts.contact_type` `HOTLINE/PHONE/…` không phải discriminator — ngoài phạm vi quy ước này.)*

## Alternatives Considered
- **Đa hình toàn cục (mọi quan hệ `owner_type/owner_id`):** đồng nhất nhưng mất FK/cascade cho media/verification → ảnh mồ côi, xác minh treo. → **Loại.**
- **Bảng riêng mỗi cặp (không arc, không đa hình):** nhân bản schema + logic N lần (vd `place_media/review_media/...`). → **Loại.**
- **Exclusive arc mặc định + đa hình ngoại lệ (chọn):** cân bằng toàn vẹn và linh hoạt; đã là chuẩn de-facto.

## Consequences
### Positive
- Toàn vẹn tham chiếu + cascade cho dữ liệu cần chặt; linh hoạt cho tham chiếu lỏng/đa module.
- Nhất quán biểu diễn ORM: arc = nhiều quan hệ optional + `CHECK` migration; đa hình = `entity_type + entity_id` + ràng buộc tầng app.
- Gỡ nghịch lý: các ADR Accepted (005/006/008/009/014/016) nay dựa trên nền **Accepted**.

### Negative
- Arc: thêm loại chủ phải ALTER `CHECK` (vd `media` +`event_id`).
- Đa hình: không cascade DB → cần dọn/kiểm tra tầng app; ORM không có FK gốc.

## Related Documents
- [database.md §3.5 (media arc 5 nhánh), §3.14–3.18, §3.21](../data/database.md) · [verification.md §2](../data/modules/verification.md) · [source.md](../data/modules/source.md) · [erd.md §1](../data/erd.md)

## Related ADR
- [ADR-005](ADR-005-contact-entity.md) · [ADR-006](ADR-006-price-history.md) · [ADR-008](ADR-008-verification-model.md) · [ADR-009](ADR-009-media-model.md) (arc media, +event_id) · [ADR-014](ADR-014-revision-model.md) · [ADR-016](ADR-016-audit-log-model.md) · [ADR-002](ADR-002-place-extension.md)

## Notes
- Chính thức hóa 2026-07-13 cùng commit Wave 2 (gỡ blocker B-2 trong ORM Readiness). Ngoại lệ đa hình phải nêu lý do rõ trong ADR của entity tương ứng.
