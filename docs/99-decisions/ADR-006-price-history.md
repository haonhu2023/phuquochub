# ADR-006 — Mô hình Price History (Price History Model)

## Status
**Accepted** — 2026-07-12. Supersedes bảng `place_tickets` ([places.md §5](../data/modules/places.md)).

## Context
- `place_tickets` (places.md §5) mô hình **bảng giá hiện hành** (nhiều loại vé) — nhưng không giữ **lịch sử giá đã xác minh**.
- `verification.md §4` cần `verifications.price_history_id → price_history` (exclusive arc) + WF-16 yêu cầu **"ghi bản giá mới, không ghi đè"**; `database.md §11` đánh dấu `price_history` ⛔ chưa định nghĩa → **chặn Verification (B5)**.
- Yêu cầu (Chief Data Architect): PriceHistory là entity chuẩn toàn hệ thống, hỗ trợ **Place · Hotel · Tour · Event · Business Service · Real Estate**, thay hoàn toàn `place_tickets`.

## Decision
Tạo bảng dùng chung **`price_history`** **polymorphic** (`entity_type` + `entity_id`), **append-only theo thời gian**, đồng thời đóng vai trò bảng giá hiện hành ([database.md §3.15](../data/database.md)):

- `entity_type ∈ {place, hotel, tour, event, business_service, real_estate}` (**lowercase snake_case, B-3**; VARCHAR → **thêm module không đổi schema**); `entity_id` = id thực thể chủ. "Place 1:N PriceHistory" = `entity_type=place`.
- Trường: `id, entity_type, entity_id, service_name, amount, currency, unit, is_free, description, display_order, valid_from, valid_to, source_id, verification_status, verified_at, updated_by, created_at, updated_at, deleted_at`.
- **Thay hoàn toàn `place_tickets`**; giữ các trường "menu" (`service_name/unit/is_free/display_order`). **"Giá hiện hành"** = bản ghi đang trong `[valid_from, valid_to]`.
- **Provenance qua `source_id → sources`** (thay cột `source` thô) + `verifications.price_history_id`.
- `places.price_range` (ENUM thô) **giữ lại** làm bộ lọc nhanh.

## Consequences
### Positive
- Một entity giá chuẩn cho toàn hệ thống, **tái dùng đa module không đổi schema**; giữ **lịch sử + freshness** (tự `expired`).
- **Mở khóa B5** (`price_history_id` có bảng đích) — cùng `contacts` (B3) hoàn tất FK targets của Verification.

### Negative / đánh đổi
- **Polymorphic ⇒ mất FK/cascade** từ chủ (toàn vẹn ở tầng ứng dụng, như `contacts`).
- Truy vấn "giá hiện hành" cần lọc `[valid_from, valid_to]` + `latest per service_name` (đánh đổi của mô hình append-only).
- Cache xác minh dùng `verification_status` + `verified_at` (**đã chốt B5/[ADR-008](ADR-008-verification-model.md)** — `is_verified` đã bỏ hoàn toàn).
- Hỗ trợ Hotel/Tour/Event — **ADR-002 Accepted (2026-07-13)**: Hotel/Tour = Place chuyên biệt (satellite), Event = peer (`entity_type='event'`); Business **Accepted** ([ADR-015](ADR-015-business-ownership-model.md)); RealEstate còn sau.

## Alternatives Considered
- **Giữ `place_tickets` + `price_history` (bổ sung, không thay):** đúng thiết kế cũ (menu vs lịch sử) nhưng hai bảng chồng vai; người dùng chọn **hợp nhất**. → Không chọn.
- **`place_id` FK-only:** FK/cascade thật nhưng **không** hỗ trợ Business Service/Real Estate. → Không chọn (thiếu tái dùng).
- **Exclusive arc (như `media`):** FK thật nhưng thêm loại chủ = +cột+CHECK; kém linh hoạt cho "đa module". → Không chọn.
- **Polymorphic (chọn):** ngoại lệ ADR-003 cho tham chiếu lỏng/nhiều loại chủ (như `contacts`).

## References
- [database.md §3.15](../data/database.md) · [places.md §5](../data/modules/places.md) · [erd.md §2](../data/erd.md) · [api.md §11.2](../api/api.md) · [verification.md §4/§7](../data/modules/verification.md) · [contribution.md WF-16](../workflow/contribution.md) · [source.md §5](../data/modules/source.md)
- Related ADR: [ADR-003](ADR-003-no-polymorphic.md) (ngoại lệ polymorphic) · [ADR-005](ADR-005-contact-entity.md) (cùng mẫu) · [ADR-008](ADR-008-verification-model.md) (verification, cache `verification_status`)
- Nguồn: Blocker B4 trong rà soát docs/ chuẩn bị Prisma. Quyết định 2026-07-12 (Chief Data Architect).
