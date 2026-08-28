import { VerificationStatus } from '../modules/places/place.enums';
import { isTrustedStatus } from '../modules/verifications/verification.transition';

/**
 * Public API price trust gate (2026-08-28) — dùng LẠI đúng domain policy đã có
 * (`isTrustedStatus`, `verifications/verification.transition.ts`: verified/official/
 * community_verified) thay vì tự định nghĩa một danh sách trạng thái tin cậy thứ hai.
 * `verification.transition.ts` là một file thuần (không @Injectable, không đăng ký module) nên
 * import trực tiếp từ đây KHÔNG tạo vòng lặp module NestJS nào.
 *
 * Cùng semantics với web (`apps/web/src/modules/places/trust.ts` — `canDisplayPrice`/
 * `isTrustedVerification`), triển khai ĐỘC LẬP: API không được import ngược kiến trúc từ apps/web.
 *
 * `status` nhận cả giá trị thô đọc thẳng từ SQL (`unknown`, có thể `undefined`/`null`/chuỗi lạ)
 * lẫn `VerificationStatus` thật — ép kiểu ở đây an toàn vì giá trị enum CHÍNH LÀ chuỗi DB trả về,
 * không suy diễn thêm ngữ nghĩa nào ngoài so khớp chuỗi.
 */
export function canDisclosePrice(status: unknown): boolean {
  return typeof status === 'string' && isTrustedStatus(status as VerificationStatus);
}

/**
 * Redact `price_range` trên một card/detail ĐÃ MAP sẵn (PlaceCard, PlaceDetail, RestaurantCard,
 * TourCard, BeachCard, AttractionCard, …) — bất kỳ object nào có cặp `price_range`/
 * `verification_status` snake_case (đúng hợp đồng công khai).
 *
 * CHỈ áp ở đường ĐỌC CÔNG KHAI (`list()`/`getBySlug()` phục vụ `@Public()` route) — KHÔNG áp
 * trong `places.mapper.ts` (`toPlaceCard`/`toPlaceDetail`) vì mapper đó dùng CHUNG cho cả public
 * lẫn các đường ghi có đặc quyền (create/update/listMine): actor ở đó đang xem CHÍNH dữ liệu họ
 * vừa gửi, không phải một stranger đọc public API, nên KHÔNG được redact — che giá trị họ vừa tự
 * nhập là một lỗi UX, không phải một biện pháp bảo mật.
 */
export function redactUntrustedPriceRange<T extends { price_range: unknown; verification_status: unknown }>(
  item: T,
): T {
  if (canDisclosePrice(item.verification_status)) return item;
  return { ...item, price_range: null };
}
