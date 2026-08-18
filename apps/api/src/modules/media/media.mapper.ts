import { Media } from './entities/media.entity';
import { MediaStatus } from './media.enums';

export type MediaResponse = ReturnType<typeof toMedia>;

// Map entity → response snake_case (khớp openapi Media).
//
// `resolveFileUrl` nhận MEDIA ID (không phải object_key nữa — Secure Private Media, 2026-08-10):
// URL trả cho client giờ trỏ về chính API (`/media/{id}/file`), nơi trạng thái publish được kiểm
// tra LẠI mỗi lần tải và một signed URL ngắn hạn mới được sinh ra. Trước đây hàm này nhận
// `object_key` và dựng thẳng URL object storage — URL đó chỉ hoạt động khi bucket mở anonymous
// read cho TOÀN BỘ object, tức là lộ cả media pending/hidden/rejected cho bất kỳ ai liệt kê được
// bucket (docs/data/modules/media.md §13).
//
// Điều kiện `status === PUBLISHED` GIỮ NGUYÊN ở đây: nó vẫn là chốt chặn "không bao giờ phát URL
// cho media chưa duyệt", và giờ được lặp lại độc lập một lần nữa trong SQL của
// `findPublishedObjectKey()` — hai lớp, để một lỗi ở tầng này không tự động thành lỗ hổng.
export function toMedia(m: Media, resolveFileUrl: (mediaId: string) => string) {
  const url = m.url ?? (m.status === MediaStatus.PUBLISHED && m.objectKey ? resolveFileUrl(m.id) : null);
  return {
    id: m.id,
    type: m.type,
    url,
    thumbnail_url: m.thumbnailUrl,
    caption: m.caption,
    alt_text: m.altText,
    status: m.status,
    // Licence metadata is PUBLIC on purpose (Place Information Foundation, 2026-08-18). For
    // `license_type = 'open_license'` (CC BY/BY-SA) displaying the credit and linking the licence
    // is the *condition* of the grant — withholding these from the response would make every
    // consumer non-compliant by construction. Nothing here is internal bookkeeping: the source
    // catalogue (`sources`/`source_attributions`) stays internal, this is only the credit line the
    // licence obliges us to show.
    attribution: m.attribution,
    license_type: m.licenseType,
    license_url: m.licenseUrl,
  };
}
