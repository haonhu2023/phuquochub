# ADR-002 — Cách mở rộng Place (Place Extension)

## Status
**Accepted** — 2026-07-13 (Wave 2). Hiện thực hóa nguyên tắc [ADR-001](ADR-001-place-is-core.md) (Place là core) cho Hotel/Restaurant/Tour; áp mẫu FK-thật của [ADR-003](ADR-003-no-polymorphic.md). Chuyển stub [places.md §13](../data/modules/places.md) thành schema thi hành.

## Context
- Hotel/Restaurant/Tour là các loại **địa điểm chuyên biệt** (đều là POI có tọa độ) cần trường riêng (hạng sao, loại phòng, thực đơn, lộ trình, lịch khởi hành) mà `places` lõi **không** chứa.
- Nguyên tắc B7/[ADR-001](ADR-001-place-is-core.md): `places` là bảng cột **duy nhất, ổn định** — **không** thêm cột theo loại.
- Event **khác bản chất**: là thực thể **theo thời gian**, có thể **không gắn địa điểm** (`place_id` nullable — BR-E3), **định kỳ** (recurrence), vòng đời thời gian (upcoming/ongoing/ended). Không phải POI.

## Problem
Chốt **một** cơ chế mở rộng Place cho Hotel/Restaurant/Tour **không sửa `places`, không polymorphic**, giữ toàn vẹn tham chiếu; và xác định Event thuộc mô hình nào (extension hay peer).

## Decision
**Class-Table Inheritance (satellite), discriminator = `places.category`:**

1. **Hotel/Restaurant/Tour = Place chuyên biệt.** Mỗi loại thêm:
   - **1 bảng chi tiết 1:1** `place_<type>_details` (PK = `place_id` = FK→`places`, `ON DELETE CASCADE`).
   - **0..n bảng con 1:N** khóa `place_id` (`hotel_room_types`, `restaurant_menu_sections`/`_items`, `tour_stops`, `tour_schedules`).
   - Từ điển dùng chung N:N: `amenities`/`place_amenities`, `cuisines`/`place_cuisines`.
   - **FK thật + cascade, KHÔNG polymorphic** (nhất quán ADR-003). **KHÔNG thêm cột vào `places`.**
   - Discriminator = `places.category` (`hotel/restaurant/tour`). Schema đầy đủ ở [places.md §13](../data/modules/places.md).

2. **Event = thực thể peer (Hybrid), KHÔNG phải Place extension.** `events` độc lập, tham chiếu Place qua `place_id` (nullable, venue) + `organizer_id` (nullable, business); **tái dùng** tầng Place qua liên kết: giá vé `price_history(entity_type='event')`, provenance `source_attributions(entity_type='event')`, phiên bản `wiki_revisions(entity_type='event')`, media qua `media.event_id` (exclusive arc — [ADR-009](ADR-009-media-model.md)). Schema ở [database.md §3.22–3.23](../data/database.md).

3. **Giá:** `price_ref`/`tour_schedules.price`/`hotel_room_types.price_ref` là **cache hiển thị nhanh**; nguồn giá **xác minh & lịch sử** là `price_history` (ADR-006, `entity_type` đã có `hotel/tour/event` — lowercase B-3).

## Alternatives Considered
- **Single-table (thêm cột nullable vào `places`):** vi phạm B7/ADR-001 (Place phình theo loại), sparse columns. → **Loại.**
- **Bảng độc lập mỗi loại (không FK 1:1 tới places):** lặp trường Place, đi ngược ADR-001 (Place là core), phá tìm kiếm/bản đồ hợp nhất. → **Loại.**
- **Ép Event thành Place extension (category=event):** phá BR-E3 (event online/không địa điểm), phá recurrence, ô nhiễm `places` bằng thực thể thời gian. → **Loại** (chọn Hybrid).

## Consequences
### Positive
- `places` **bất biến**; thêm loại mới = thêm bảng, **0 ALTER** `places`.
- Toàn vẹn chặt (FK thật + cascade); tái dùng nguyên trạng media/contacts/price_history/verifications/wiki_revisions trên `place_id`.
- Event mô hình đúng bản chất thời gian; không méo Place.

### Negative
- Nhiều bảng nhỏ (join khi render trang loại) — chấp nhận, index đủ.
- `price_ref` vs `price_history` là hai nguồn giá (cache vs xác minh) — cần job đồng bộ/quy ước ưu tiên.
- Truy vấn "một Place đầy đủ theo loại" phải biết `category` để join đúng bảng chi tiết (đóng gói ở tầng service).

## Migration
- **Chỉ thêm bảng mới**; **0 ALTER** trên `places`.
- Bảng mới (12 extension): `place_hotel_details`, `hotel_room_types`, `amenities`, `place_amenities`, `place_restaurant_details`, `restaurant_menu_sections`, `restaurant_menu_items`, `cuisines`, `place_cuisines`, `place_tour_details`, `tour_stops`, `tour_schedules`.
- Peer Event (2): `events`, `event_occurrences`.
- Enum mới: `hotel_type`, `tour_type`, `tour_difficulty`, `event_status`, `event_status_override`.
- Enum mở rộng: `source_attributions.entity_type += event`; `wiki_revisions.entity_type += event`; **`media` exclusive arc += `event_id`** (ADR-009). `price_history.entity_type` **đã có** `hotel/tour/event`. **Mọi discriminator: lowercase snake_case (B-3).**
- Seed `categories`: `hotel/restaurant/tour`.
- Backfill: không (greenfield).

## Related Documents
- [places.md §13](../data/modules/places.md) (schema extension authoritative) · [database.md §3.5, §3.22–3.23, §11](../data/database.md) · [erd.md](../data/erd.md) · [data-dictionary.md](../data/data-dictionary.md) · [api.md §12–15](../api/api.md) · openapi.yaml · product [hotel.md](../product/modules/hotel.md)/[restaurant.md](../product/modules/restaurant.md)/[tour.md](../product/modules/tour.md)/[event.md](../product/modules/event.md)

## Related ADR
- [ADR-001](ADR-001-place-is-core.md) (Place core) · [ADR-003](ADR-003-no-polymorphic.md) (arc, media event_id) · [ADR-006](ADR-006-price-history.md) (giá) · [ADR-009](ADR-009-media-model.md) (media arc) · [ADR-014](ADR-014-revision-model.md) (wiki_revisions entity_type)

## Notes
- Đề xuất: Principal Data Architect. Ngày 2026-07-13 (Wave 2). Nguồn: Blocker Prisma P0 ADR-002.
- Còn mở: quy ước ưu tiên `price_ref` vs `price_history`; xác minh Event (nếu cần `verifications.event_id` sau này).
