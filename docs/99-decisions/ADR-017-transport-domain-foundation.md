# ADR-017 — Nền tảng miền Transport (Transport Domain Foundation)

## Status

**Accepted** — 2026-07-28 (đề xuất), chấp thuận triển khai nền tảng (schema + đọc tối thiểu, KHÔNG gồm trang Browse công khai) cùng ngày qua chỉ đạo tường minh "Implement the approved Transport Domain Foundation." Mở rộng [ADR-002](ADR-002-place-extension.md) cho một trường hợp mới: một satellite mà trục phân loại chính (`transport_type`) phải **mở rộng được không cần migration**, khác Hotel/Restaurant/Tour vốn dùng ENUM đóng cho trục tương đương (`hotel_type`/`tour_type`).

**Implementation:** hoàn tất (governance reconciliation, 2026-07-30) — migration `InitTransport1720002300000` đã áp dụng trên database sống (`migration:show` → `[X]`), tạo đúng 5 bảng ở §Migration bên dưới; module `apps/api/src/modules/transports/` (`GET /transports`, `GET /transports/{slug}`) đang chạy công khai; tài liệu hoá đầy đủ ở `docs/api/openapi.yaml`. §Migration/§Related Documents bên dưới trước đây còn ghi "chưa thực hiện" — đã cập nhật để khớp thực tế; §Context/§Decision/§Alternatives giữ nguyên vì vẫn mô tả đúng lý do quyết định.

**Quyết định đặt tên (chốt tại bước triển khai, theo đúng mẫu 5 vertical hiện có — xem [transport.md §Naming](../data/modules/transport.md)):** category slug `transport` (số ít, khớp `hotel/restaurant/tour/attraction/beach`); module/class/route số nhiều `Transports*`/`modules/transports`/`GET /transports`, `GET /transports/{slug}` (khớp `Hotels*`/`/hotels`…); từ điển loại hình lộ ra ở route phẳng top-level `GET /transport-types` (không có tiền lệ mâu thuẫn, đúng gợi ý của yêu cầu triển khai).

## Context

- Repo đã xác nhận: **không có bất kỳ dấu vết Transport nào** — 0 bảng khớp `%transport%`/`%vehicle%`/`%ferry%`/`%route%`, 0 category `transport` trong 8 category hiện có, 0 dòng openapi, chỉ có 1 từ `phương tiện` trong `vision.md §3.2` (danh sách chủ đề wiki *dự kiến bao phủ*, không phải spec).
- Repo đã có **năm** vertical browse hoàn thiện theo hai khuôn mẫu:
  - **Satellite có bảng chi tiết riêng** (Hotel/Restaurant/Tour, ADR-002): `place_<type>_details` 1:1 + bảng con 1:N + từ điển N:N.
  - **Category thuần không bảng vệ tinh** (Attraction/Beach, phiên làm việc này): chỉ là `categories.slug` lọc trên chính `places`.
- Mission yêu cầu Transport hỗ trợ ≥12 loại hình (Taxi, Airport Transfer, Shuttle, Ferry, Cano, Speedboat, Private Car, Motorbike/Bicycle Rental, Electric Buggy, Bus, Yacht Charter) **nhưng cấm hardcode chúng như category bắt buộc** — mâu thuẫn trực tiếp với cách Hotel/Tour đang phân loại con (ENUM đóng `hotel_type`/`tour_type`), buộc phải chọn một cơ chế khác cho đúng một trục này.
- `price_history.entity_type` (ADR-006) là `VARCHAR(30)` tự do, đã liệt kê sẵn sẽ mở rộng cho loại mới (`hotel/tour/event` đã có) — không phải ENUM, nên thêm `transport` **không cần DDL**.
- Business ownership (`business_claims`/`business_members`, ADR-015) đã **Accepted** trên giấy nhưng **chưa migrate** (0 bảng trong DB sống) — Transport không thể phụ thuộc cứng vào nó.

## Problem

Chốt **một** cơ chế mở rộng Place cho Transport: vừa tái dùng tối đa hạ tầng Place hiện có (media/contacts/reviews/wiki_revisions/price_history/faqs/seo), vừa cho phép thêm loại hình vận chuyển mới **chỉ bằng INSERT**, không ALTER schema — điều Hotel/Tour hiện tại **không** làm được cho trục phân loại của chúng.

## Decision

**Transport = Place chuyên biệt (satellite, ADR-002), nhưng trục phân loại chính là bảng từ điển mở rộng được (`transport_types`), không phải ENUM.**

1. **Một category mới duy nhất** `categories.slug = 'transport'` — discriminator giống hệt Hotel/Restaurant/Tour/Attraction/Beach, **không** tạo category con theo từng loại hình (Taxi/Ferry/… **không** phải category).
2. **`place_transport_details`** — 1:1 (`place_id` PK/FK CASCADE), giữ `transport_type_id` **NOT NULL** FK → `transport_types` (thay vì ENUM). Đây là khác biệt DUY NHẤT so với khuôn Hotel/Tour; mọi cột khác theo đúng nguyên tắc "chỉ điền được xác nhận" đã áp dụng cho Attraction/Beach/mẻ seed vá lỗ hổng vừa xong (session trước): trường không chắc chắn → nullable, **không** default che giấu dữ liệu thiếu (vd `booking_required`/`airport_transfer` là BOOLEAN NULLABLE tri-state, KHÔNG `NOT NULL DEFAULT false` như `is_local_specialty` — vì "chưa xác nhận cần đặt trước" và "chưa xác nhận là đặc sản" có mức rủi ro sai khác nhau).
3. **`transport_types`** là từ điển kiểu `amenities`/`cuisines` (code UNIQUE, label_vi/label_en, icon) **cộng thêm** `parent_id` tự tham chiếu — tái dùng nguyên mẫu `categories.parent_id` (đã có sẵn, chưa dùng) thay vì phát minh cơ chế phân cấp mới.
4. **Giá:** KHÔNG tạo bảng `PricingModel`/`transport_pricing` riêng. Tái dùng đúng khuôn ADR-006: `place_transport_details.price_ref`/`pricing_model` (ENUM đóng, nhỏ, ổn định — khác `transport_type`) là **cache hiển thị**; nguồn giá xác minh/lịch sử là `price_history` với `entity_type='transport'` — **không cần migration cho price_history** (cột đã là free-text).
5. **Gói dịch vụ nhiều mức giá** (vd taxi 4 chỗ/7 chỗ, cano riêng theo giờ) → `transport_service_options` (1:N), **tái dùng nguyên khuôn** `hotel_room_types` (tên/khách/giá/hiệu lực), đổi tên cho đúng miền — không phát minh `VehicleType`/`VehicleCapacity` là entity riêng.
6. **Tuyến cố định** (ferry/cano có điểm đi–đến rõ) → `transport_routes` (1:N, optional, GEOGRAPHY point như `tour_stops`).
7. **Vùng phục vụ** → `transport_service_areas` (place_id, ward) tái dùng **nguyên trạng** `places.ward` (text tự do, đã là quy ước xuyên suốt Tour/Attraction/Beach) qua bảng junction, **không** tạo từ điển `service_areas` mới — tránh trùng lặp khái niệm vị trí (đúng chỉ đạo Phase 3 "avoid duplicate location data").
8. **Mọi hạ tầng còn lại tái dùng nguyên trạng, 0 thay đổi:** media (`place_id` arc có sẵn), contacts (`owner_type='place'`), reviews (`place_id` FK có sẵn, generic mọi Place), wiki_revisions/place_faqs/place_seo/place_ai_summary (generic), Business ownership (`business_id`→`places`, generic — Transport tự động "claim được" ngay khi ADR-015 được migrate, không cần việc gì thêm).
9. **`GET /transport/{slug}` là endpoint riêng** (không dùng chung `/places/{slug}` như Attraction/Beach) — vì Transport có con 1:N thật sự cần ghép (service_options/routes/service_areas), cùng lý do Hotel/Tour có endpoint chi tiết riêng còn Attraction/Beach thì không.

Chi tiết cột/bảng/index/migration/API đầy đủ ở [transport.md](../data/modules/transport.md) (tài liệu PROPOSED đồng hành, sẽ trở thành phần chính thức của `places.md §13.5` **sau khi ADR này Accepted** — đúng thứ tự đã dùng cho ADR-002 → places.md §13).

## Alternatives Considered

- **ENUM đóng cho `transport_type` (giống `hotel_type`/`tour_type`):** vi phạm trực tiếp yêu cầu "không hardcode như category bắt buộc"; thêm loại hình mới (vd "Helicopter Transfer") sẽ cần migration. → **Loại.**
- **Mỗi loại hình = một category riêng** (`taxi`, `ferry`, `cano`, …): nhân bản logic browse 12 lần, phá vỡ đúng mức hạt "loại Place" mà 5 category hiện có đang giữ (Hotel/Restaurant/Tour/Attraction/Beach — mỗi category là MỘT loại Place, không phải một thuộc tính của Place). → **Loại.**
- **Bảng `PricingModel`/`transport_pricing` riêng, không dùng `price_history`:** trùng lặp đúng vấn đề ADR-006 đã giải quyết (giá cache vs giá xác minh/lịch sử); Hotel/Tour đã chứng minh mẫu dùng chung hoạt động. → **Loại.**
- **Từ điển `service_areas` riêng thay vì tái dùng `places.ward`:** chính xác hơn (chống lỗi gõ) nhưng phá vỡ quy ước "ward là text tự do" đã dùng nhất quán ở Tour/Attraction/Beach; đổi quy ước cho một mình Transport là bất nhất, không phải cải tiến cục bộ hợp lý ở giai đoạn nền tảng này. → **Hoãn**, ghi nhận là cải tiến khả dĩ tương lai, không phải quyết định của ADR này.
- **`GET /transport/{slug}` dùng chung `/places/{slug}`** (giống Attraction/Beach): đơn giản hơn, nhưng Transport có con 1:N (service_options/routes) mà `PlaceDetail` chung không biểu diễn được mà không làm phình hợp đồng đó cho mọi Place khác. → **Loại**, theo đúng tiền lệ Hotel/Tour.
- **`GET /transport/operators` như một endpoint độc lập:** không có mô hình dữ liệu nào đứng sau ngoài `provider_business_id` (FK tới chính `places`), và Business ownership chưa migrate. Liệt kê "operator" tách khỏi transport listing lúc này là suy đoán một use case chưa có nền. → **Loại/hoãn**, phụ thuộc ADR-015 được thi hành.

## Consequences

### Positive
- `places` bất biến (0 ALTER), đúng B7/ADR-001.
- Thêm loại hình vận chuyển mới = 1 INSERT vào `transport_types`, không cần deploy migration — giải đúng bài toán Phase 2 đặt ra.
- Toàn bộ hạ tầng Place (media/contacts/reviews/giá/claim doanh nghiệp) tái dùng 100%, không có bảng "review_transport"/"media_transport" riêng nào.
- `GET /transport/types` lấp một lỗ hổng đã tồn tại từ trước (Tour/Attraction/Beach đều hardcode danh sách ward ở frontend vì không có endpoint tra cứu) — Transport là vertical đầu tiên có từ điển thật sự truy vấn được qua API.

### Negative
- Đây là satellite DUY NHẤT có trục phân loại qua FK từ điển thay vì ENUM — người đọc quen mẫu Hotel/Tour sẽ cần đọc ghi chú giải thích vì sao khác đi (đã viết trong Decision §2).
- `transport_service_areas` dùng text tự do (`ward`) nên không có ràng buộc toàn vẹn chống lỗi gõ — chấp nhận đánh đổi để nhất quán với Tour/Attraction/Beach, không tối ưu cục bộ.
- Chưa có dữ liệu thật (0 nhà cung cấp vận chuyển đã xác minh trong repo) — mọi seed ở giai đoạn này chỉ có thể là dữ liệu THAM CHIẾU (`transport_types`), không phải dữ liệu doanh nghiệp; browse page sẽ trống cho tới khi có nguồn thật, giống đúng tình trạng Hotel/Restaurant/Tour trước khi được vá ở phiên làm việc trước ADR này.

## Migration

**Đã thực hiện** — `1720002300000-InitTransport.ts` (đúng tiền lệ `InitHotel`/`InitRestaurant`/`InitTour` — gộp toàn bộ bảng/enum/seed category trong một file, reversible qua `down()`), tạo `pricing_model` enum + `transport_types`/`place_transport_details`/`transport_service_options`/`transport_routes`/`transport_service_areas` (khớp đúng kế hoạch ban đầu, không lệch), seed 12 mã `transport_types` + 1 dòng `categories` mới. Không ALTER `price_history` (cột đã tự do). Chi tiết ở [transport.md §6](../data/modules/transport.md).

## Related Documents
- [transport.md](../data/modules/transport.md) (tài liệu đồng hành — schema/ERD/migration/seed/API đầy đủ; §0/§9 giữ nguyên là ghi chép lịch sử/roadmap tại thời điểm viết, banner trạng thái ở đầu file đã cập nhật khớp thực tế)
- [places.md §13](../data/modules/places.md) (chưa nhận §13.5 — gộp `transport.md` vào đây vẫn là việc tương lai, không phải phần của việc reconciliation này)
- [erd.md](../data/erd.md), [data-dictionary.md](../data/data-dictionary.md), `docs/api/openapi.yaml` (đã có `GET /transports`, `GET /transports/{slug}`)

## Related ADR
- [ADR-002](ADR-002-place-extension.md) (mẫu satellite gốc — ADR này là một biến thể có chủ đích, không thay thế)
- [ADR-003](ADR-003-no-polymorphic.md) (FK thật, không polymorphic — Transport tuân thủ nguyên vẹn)
- [ADR-006](ADR-006-price-history.md) (giá cache vs xác minh — Transport tái dùng, không mở rộng thiết kế)
- [ADR-015](ADR-015-business-ownership-model.md) (claim doanh nghiệp — Transport phụ thuộc gián tiếp, không chặn)

## Notes
- Đề xuất trong phiên làm việc audit-trước-implement (Transport Domain Foundation), 2026-07-28. Không có code, migration, hay entity nào được tạo cùng đề xuất này — theo đúng yêu cầu "Do not begin implementation until the architecture has been fully reviewed."
- Còn mở: (1) có nên thêm `capacity_min`/sort theo capacity sau khi có dữ liệu thật; (2) `service_areas` có nên tách thành từ điển riêng một khi ≥3 vertical khác cũng cần vùng phục vụ có cấu trúc (cùng ngưỡng "3 consumer" đã áp dụng cho việc tách `PHU_QUOC_WARDS` ở frontend phiên trước); (3) seed dữ liệu doanh nghiệp thật chờ nguồn xác minh được (xem [source.md](../data/modules/source.md)).
