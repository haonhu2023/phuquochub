# ADR-001 — Place là thực thể lõi (Place is Core)

## Status
**Accepted** — 2026-07-12. Đồng thời chốt **mô hình Place authoritative** (hợp nhất hai bộ trường — Blocker B7).

## Context
- Vision "Wikipedia + Reddit + Google Maps cho Phú Quốc": mọi module nghiệp vụ (Hotel/Restaurant/Tour/Event/Review/Community/Business/Search/AI) đều xoay quanh **địa điểm (POI)**.
- Trước đây Place bị **định nghĩa hai nơi với hai bộ trường khác nhau**: `database.md §3.3` (bản tóm tắt cũ: `phone/website`, `ward/commune`, thiếu cache/audit) vs `places.md §3` (bản chi tiết: length/nullable/index đầy đủ, `short_description`, `cover_image_id`, `view_count`, `updated_by`, đã tích hợp ADR-005/008/009) ⇒ **drift**, chặn sinh Prisma (B7).
- Các ADR vệ tinh đã Accepted: ADR-005 (contacts), ADR-006 (price_history), ADR-008 (verification), ADR-009 (media), ADR-014 (wiki_revisions) — Place chỉ còn cần một bản ghi trường chuẩn duy nhất.

## Decision
1. **Place là thực thể trung tâm** mà mọi module tham chiếu; các loại chuyên biệt (Hotel/Restaurant/Tour/Event) là **Place chuyên biệt** (cách mở rộng chốt ở ADR-002).
2. **[places.md §3](../data/modules/places.md) là định nghĩa authoritative DUY NHẤT** của entity Place (field, kiểu, nullable, unique, FK, index, audit). `database.md §3.3` chỉ giữ **tổng quan + quan hệ + con trỏ**, không định nghĩa lại schema.
3. **Nguyên tắc nội dung Place:** chỉ chứa (a) **dữ liệu ổn định** — name, slug, location, address, `ward` (bỏ `commune`), category, opening_hours (JSONB, bán ổn định), price_range, osm_id, audit (`created_by/updated_by`), soft delete; và (b) **cache đọc nhanh job-synced** — `rating_avg`, `rating_count`, `view_count` (đồng bộ theo nhịp job từ reviews/`place_views_agg`, **không** ghi per-event), `verification_status`/`verified_at` (ADR-08). *(Đây là liệt kê nguyên tắc, KHÔNG phải bộ trường đầy đủ — **danh sách trường đầy đủ & duy nhất ở [places.md §3](../data/modules/places.md)**; trường mở rộng theo loại ở places.md §13.)*
4. **Dữ liệu biến động ở entity vệ tinh:** `contacts` · `price_history` · `media` · `wiki_revisions` (kiêm lịch sử trạng thái — WF-14) · `reviews` · `verifications`. Không tạo bảng lịch sử trạng thái riêng.

## Alternatives Considered
- **Giữ hai định nghĩa song song:** nguồn drift vĩnh viễn, chặn Prisma. → **Loại.**
- **database.md là authoritative:** bản này lỗi thời (thiếu ADR-005/008/009, còn `commune`), phải viết lại toàn bộ trong khi places.md đã đúng. → Loại.
- **Place "lean" (bỏ `view_count`/cache khỏi places, đọc từ analytics):** thuần "dữ liệu ổn định" hơn nhưng mỗi place card phải join/aggregate — đánh đổi hiệu năng đọc không đáng. → Không chọn; giữ cache job-synced.

## Consequences
### Positive
- **Một nguồn sự thật** cho Place — hết drift giữa database.md và places.md; gỡ blocker B7 cho Prisma.
- Render place card/list **không cần join** analytics/reviews (đọc cache); nguyên tắc "ổn định + cache job-synced" rõ ràng cho mọi field tương lai.
- Nhất quán toàn bộ ADR vệ tinh (005/006/008/009/014).

### Negative / đánh đổi
- Cache (`rating_*`, `view_count`, `verification_status`) phải **đồng bộ bằng job** — chấp nhận độ trễ theo nhịp job; nguồn gốc vẫn là reviews/`place_views_agg`/`verifications`.
- `location GEOGRAPHY(Point,4326)`: Prisma không có native type — sẽ cần `Unsupported(...)` + `$queryRaw` PostGIS, hoặc quyết định ORM riêng (**mâu thuẫn TypeORM/Prisma ở architecture.md §11 là quyết định tách riêng, ngoài phạm vi ADR này**).

## References
- [places.md §3](../data/modules/places.md) (authoritative) · [database.md §3.3/§11](../data/database.md) (tổng quan + catalog) · [erd.md](../data/erd.md) · [api.md §11](../api/api.md) · [vision.md](../overview/vision.md) · [product/modules/place.md](../product/modules/place.md)
- Related ADR: [ADR-002](ADR-002-place-extension.md) (cách mở rộng — Accepted) · [ADR-005](ADR-005-contact-entity.md) · [ADR-006](ADR-006-price-history.md) · [ADR-008](ADR-008-verification-model.md) · [ADR-009](ADR-009-media-model.md) · [ADR-014](ADR-014-revision-model.md)
- Nguồn: Blocker B7 trong rà soát docs/ chuẩn bị Prisma. Quyết định 2026-07-12 (Chief Data Architect).
