# ADR-009 — Mô hình media (Media Model)

## Status
**Accepted** — 2026-07-12. Supersedes bảng `place_media` ([places.md §6](../data/modules/places.md)) và thiết kế `media` đa hình cũ (`owner_type/owner_id`).

## Context
- [database.md §3.5](../data/database.md) trước đây định nghĩa `media` **đa hình** (`owner_type ENUM(place, review, community_post)` + `owner_id`) — schema nghèo, mất FK/cascade.
- [places.md §6](../data/modules/places.md) định nghĩa `place_media` **theo place** — giàu trường (thumbnail, provider, external_id, duration, caption, alt, sort_order, status) nhưng chỉ cho Place.
- [api.md §19](../api/api.md) (presign `owner_type/owner_id`), Review §16 (`media_ids`), [WF-17/18](../workflow/moderation.md) (upload + AI moderation) đều cần ảnh cho **nhiều** loại chủ sở hữu.
- [ADR-003](ADR-003-no-polymorphic.md) ưu tiên FK thật / exclusive arc khi cần toàn vẹn; Prisma không hỗ trợ FK đa hình gốc ([erd.md §5](../data/erd.md)).
- **Vấn đề:** hai thiết kế song song cần chọn một; cần cascade chống ảnh mồ côi; phục vụ nhiều loại chủ sở hữu; biểu diễn đầy đủ relation trong Prisma.

## Decision
Chọn **Phương án B — một bảng `media` theo Exclusive Arc**, **retire hoàn toàn `place_media`** ([database.md §3.5](../data/database.md)):

- **Năm** FK nullable: `place_id`, `review_id`, `post_id`, `business_id` (**→ places** = media chính thức của cơ sở — chốt B8/[ADR-015](ADR-015-business-ownership-model.md)), **`event_id`** (**→ events**, thêm Wave 2 — media của Event dùng chung pipeline, **không** tạo bảng `event_media`; [ADR-002](ADR-002-place-extension.md)).
- `CHECK` đảm bảo **đúng một** FK khác NULL (exclusive arc).
- **Không** dùng `owner_type/owner_id`; **không** polymorphic.
- Giữ toàn bộ trường giàu của `place_media` + `ai_moderation_score`/`ai_labels` (WF-18); `status = pending, published, hidden, rejected`.
- `places.cover_image_id → media`; `events.cover_media_id → media` (chỉ hero/thumbnail; gallery Event qua `media.event_id`); `source_attributions.entity_type` dùng `media` (thay `place_media`).
- **Biểu diễn ORM:** 5 quan hệ optional (place/review/post/business/event) trên `media` + `CHECK` đúng-một qua migration.

## Consequences
### Positive
- FK thật + `ON DELETE CASCADE` theo từng chủ sở hữu; chống ảnh mồ côi.
- Một bảng + một pipeline upload/moderation; một `entity_type=media` cho provenance.
- Nhất quán ADR-003 và tiền lệ `verifications`; **sẵn sàng Prisma**.

### Negative / đánh đổi
- Thêm chủ sở hữu mới về sau = thêm cột FK + sửa `CHECK` (đánh đổi cố hữu của exclusive arc).
- `business_id` **→ places** (media chính thức của cơ sở, tách khỏi media cộng đồng `place_id`) — chốt B8/[ADR-015](ADR-015-business-ownership-model.md) (`business_members` Accepted).
- API breaking (mức thiết kế): client dùng `owner_type/owner_id` phải chuyển sang trường FK tường minh.

## Alternatives Considered
- **A — `media` đa hình làm giàu (`owner_type/owner_id`):** khớp API cũ nhưng **vi phạm ADR-003** (mất FK/cascade), khó biểu diễn Prisma. → **Loại.**
- **C — Giữ cả `place_media` + `media` generic:** duy trì đúng mâu thuẫn, hai pipeline, khó bảo trì. → **Loại.**

## References
- [database.md §3.5](../data/database.md) · [places.md §6](../data/modules/places.md) · [erd.md §2](../data/erd.md) · [api.md §19](../api/api.md) · [source.md §5](../data/modules/source.md) · [moderation.md WF-17/18](../workflow/moderation.md)
- Related ADR: [ADR-003](ADR-003-no-polymorphic.md) (nguyên tắc exclusive arc) · [ADR-008](ADR-008-verification-model.md) (cùng mẫu exclusive arc)
- Nguồn: Blocker B2 trong rà soát docs/ chuẩn bị thiết kế Prisma. Quyết định 2026-07-12 (Data Architect).
