import type { GeoPoint, OpeningHours, PlaceDetail, PriceRangeValue } from '@phuquochub/shared-types';

// GET /places/mine trả PlaceDetail SCALAR — không kèm contacts/prices/media/faqs (những mảng đó
// là quan hệ vệ tinh, PlacesService.listMine() không ghép, khác getBySlug()). `opening_hours` CÓ
// MẶT — GET /places/mine đã trả field này từ trước (toPlaceDetail), trước đây bị Omit khỏi kiểu
// dù dữ liệu vẫn về tới client và bị bỏ qua (đã sửa, xem PlaceForm.tsx/openingHours.ts).
//
// `trust_sources` cũng bị Omit CÙNG lý do contacts/prices/media/faqs (Place Trust & Freshness
// Surface, 2026-08-19): nó được ghép ở `PlacesService.getBySlug()` (đọc source_attributions/
// sources), KHÔNG phải ở `toPlaceDetail()` — mà `listMine()` chỉ gọi `toPlaceDetail()` trực tiếp,
// không đi qua getBySlug(). Giữ trường này trong kiểu sẽ nói dối: client tưởng field luôn có mặt
// trong khi API không bao giờ gửi nó trên đường này. `verified_at` THÌ CÓ — nó nằm ngay trong
// toPlaceDetail(), không cần ghép gì thêm.
export type ManagedPlace = Omit<PlaceDetail, 'contacts' | 'prices' | 'media' | 'faqs' | 'trust_sources'>;

// Payload gửi lên POST/PATCH /places — khớp CreatePlaceDto/UpdatePlaceDto (apps/api/src/modules/
// places/dto/places.dto.ts) từng trường một, KHÔNG thêm trường nào backend không nhận (contact/
// price/tags/amenities/opening_hours không có trong hai DTO đó, nên KHÔNG có ở đây).
//
// Các trường tuỳ chọn dùng `T | null` (KHÔNG phải `T | undefined`) một cách CÓ CHỦ Ý: form này ghi
// đè toàn bộ giá trị hiện có mỗi lần lưu (không phải patch từng phần), nên "để trống" phải gửi
// `null` — thứ UpdatePlaceDto/PlacesService.update() thật sự hiểu là "xoá giá trị đang có". Gửi
// `undefined` (bị JSON.stringify loại khỏi payload) sẽ khiến backend GIỮ NGUYÊN giá trị cũ, khiến
// người dùng bấm "Không chọn"/xoá một trường rồi Lưu nhưng dữ liệu cũ vẫn còn nguyên phía server.
export interface PlaceFormInput {
  name: string;
  category_id: string;
  location: GeoPoint;
  address: string | null;
  ward: string | null;
  description: string | null;
  short_description: string | null;
  price_range: PriceRangeValue | null;
  // KHÔNG nullable (khác các trường trên) — UpdatePlaceDto.opening_hours không nhận null,
  // `{}`/regular rỗng mới là "trống" hợp lệ theo IsOpeningHours. Luôn gửi một object hợp lệ, xem
  // openingHours.ts formStateToOpeningHours().
  opening_hours: OpeningHours;
}
