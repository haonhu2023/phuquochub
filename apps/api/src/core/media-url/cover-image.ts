import { MediaUrlService } from './media-url.service';

/**
 * Ảnh bìa của một Place — mảnh SQL + bước phân giải URL dùng CHUNG cho cả 7 repository đọc card
 * (`places` + 6 module chuyên biệt: attractions/beaches/hotels/restaurants/tours/transports).
 *
 * VÌ SAO TỒN TẠI (Owner Cover & Photo Ordering, 2026-08-12): trước đây mỗi repository tự chép một
 * bản `(SELECT m.url FROM media m WHERE m.id = p.cover_image_id …)`. Hai hệ quả:
 *
 *  1. **Ảnh bìa upload KHÔNG BAO GIỜ hiển thị được.** Đường upload luôn ghi `media.url = NULL`
 *     (chỉ lưu `object_key`, xem media.entity.ts) — URL công khai được SINH lúc đọc, không lưu.
 *     Subquery đọc thẳng `m.url` nên mọi ảnh bìa chọn từ ảnh đã upload đều ra `NULL`. Đây chính là
 *     khoảng trống đã được ghi nhận tường minh ở docs/data/modules/media.md §13.6 — milestone này
 *     đóng nó.
 *  2. Vị từ bảo mật (`status = 'published'`) bị chép 7 lần nên có thể lệch nhau theo thời gian.
 *
 * Bây giờ CHỈ CÓ MỘT định nghĩa, và nó cưỡng chế đủ ba bất biến:
 *
 *  • `m.status = 'published'` — ảnh `pending`/`rejected`/`hidden` KHÔNG BAO GIỜ ra kênh công khai
 *    qua đường ảnh bìa (INV-1). Đây là lớp phòng vệ ĐỘC LẬP với kiểm tra lúc GHI
 *    (`MediaRepository.setPlaceCoverImage`): kể cả khi một ảnh bìa hợp lệ sau đó bị ẩn/từ chối mà
 *    con trỏ `cover_image_id` chưa kịp dọn, đọc vẫn ra `NULL`.
 *  • `m.place_id = p.id` — ảnh bìa PHẢI thuộc CHÍNH cơ sở đó (quy tắc toàn vẹn ở
 *    docs/product/modules/place.md §BR). Cưỡng chế cả ở đường ĐỌC, không chỉ đường ghi, nên một
 *    `cover_image_id` trỏ chéo sang cơ sở khác (đặt bằng SQL tay, import dữ liệu…) hiển thị ra
 *    `NULL` chứ không mượn ảnh của người khác.
 *  • `m.deleted_at IS NULL` — ảnh đã gỡ biến mất khỏi mọi bề mặt.
 *
 * URL trả ra LUÔN là URL API ỔN ĐỊNH (`{API_PUBLIC_URL}/{prefix}/media/{id}/file`), KHÔNG BAO GIỜ
 * là presigned URL và KHÔNG BAO GIỜ là địa chỉ object storage — `object_key`/`bucket` không rời
 * server (media.md §13.2). Endpoint đó kiểm tra lại tư cách published ở MỖI lần tải, nên ẩn một
 * ảnh là thu hồi được ngay; một signed URL đã nhúng vào HTML thì không.
 */

/**
 * Hai cột ảnh bìa. YÊU CẦU bảng `places` được alias là `p` trong truy vấn gọi tới.
 *
 * Vì sao HAI cột chứ không một:
 *  • `cover_image_url` — giá trị `media.url` đã lưu. Chỉ dòng LEGACY/nhúng ngoài
 *    (`provider=youtube|vimeo`) mới có giá trị ở đây; giữ lại để không đổi ngữ nghĩa cũ của trường.
 *  • `cover_image_media_id` — id của ảnh ĐÃ UPLOAD (`object_key IS NOT NULL`), để tầng ứng dụng
 *    dựng URL API. Việc dựng URL KHÔNG làm trong SQL: `MediaUrlService` là nơi duy nhất biết
 *    `API_PUBLIC_URL`/global prefix, và một câu SQL không nên biết gì về HTTP routing (cùng ranh
 *    giới mà media-url.service.ts đã dựng giữa "địa chỉ object storage" và "route API").
 */
export const COVER_IMAGE_COLS = `(SELECT m.url FROM media m
                WHERE m.id = p.cover_image_id AND m.place_id = p.id
                  AND m.deleted_at IS NULL AND m.status = 'published') AS cover_image_url,
              (SELECT m.id FROM media m
                WHERE m.id = p.cover_image_id AND m.place_id = p.id
                  AND m.deleted_at IS NULL AND m.status = 'published'
                  AND m.object_key IS NOT NULL) AS cover_image_media_id`;

/** Hình dạng hai cột mà `COVER_IMAGE_COLS` sinh ra trên một row thô. */
export interface CoverImageColumns {
  cover_image_url: string | null;
  /** Cột NỘI BỘ — `withCoverImageUrl()` tiêu thụ rồi XOÁ khỏi row, không bao giờ ra response. */
  cover_image_media_id?: string | null;
}

/**
 * Phân giải `cover_image_url` cuối cùng cho MỘT row rồi gỡ cột nội bộ.
 *
 * Thứ tự ưu tiên: `media.url` đã lưu (dòng legacy/nhúng ngoài) → URL API của ảnh đã upload → null.
 * Sửa TẠI CHỖ và trả lại chính row đó: hợp đồng row của mọi caller (`PlaceCardRow` và tương đương
 * ở 6 module chuyên biệt) giữ nguyên KHÔNG ĐỔI MỘT BYTE — service/mapper/DTO/openapi phía sau
 * không phải biết chuyện gì vừa xảy ra.
 */
export function withCoverImageUrlOne<T extends CoverImageColumns>(
  row: T,
  mediaUrl: MediaUrlService,
): T {
  if (row.cover_image_url === null || row.cover_image_url === undefined) {
    row.cover_image_url = row.cover_image_media_id ? mediaUrl.fileUrl(row.cover_image_media_id) : null;
  }
  // Ép về CoverImageColumns để `delete` hợp lệ với mọi T (kể cả row có index signature).
  delete (row as CoverImageColumns).cover_image_media_id;
  return row;
}

/** Bản cho danh sách — cùng ngữ nghĩa `withCoverImageUrlOne()`, không truy vấn thêm gì (không N+1). */
export function withCoverImageUrl<T extends CoverImageColumns>(
  rows: T[],
  mediaUrl: MediaUrlService,
): T[] {
  for (const row of rows) {
    withCoverImageUrlOne(row, mediaUrl);
  }
  return rows;
}
