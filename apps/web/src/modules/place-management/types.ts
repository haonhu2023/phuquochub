import type { GeoPoint, PlaceDetail, PriceRangeValue } from '@phuquochub/shared-types';

// GET /places/mine trả PlaceDetail SCALAR — không kèm contacts/prices/media/faqs (những mảng đó
// là quan hệ vệ tinh, PlacesService.listMine() không ghép, khác getBySlug()). `opening_hours` cố
// tình bị bỏ khỏi form quản lý ở MVP này (cấu trúc lịch mở cửa hàng tuần + ngoại lệ quá phức tạp
// cho phạm vi "smallest coherent MVP" — xem báo cáo cuối task).
export type ManagedPlace = Omit<PlaceDetail, 'contacts' | 'prices' | 'media' | 'faqs' | 'opening_hours'>;

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
}
