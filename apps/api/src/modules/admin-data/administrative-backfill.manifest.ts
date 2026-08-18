/**
 * Danh sách mục tiêu backfill `places.province`/`places.admin_area` — Administrative Data Backfill
 * (2026-08-18), tiếp nối Phase 2B/Phase 3/Phase 4 (audit + rehearsal migration ea2b03e).
 *
 * NGUỒN PHÁP LÝ (một văn bản, áp dụng cho toàn bộ danh sách):
 * Nghị quyết 1654/NQ-UBTVQH15 (Ủy ban Thường vụ Quốc hội, 16/6/2025, hiệu lực 01/7/2025) — khoản 95:
 * "Sắp xếp toàn bộ diện tích tự nhiên, quy mô dân số của phường Dương Đông, phường An Thới và các xã
 * Dương Tơ, Hàm Ninh, Cửa Dương, Bãi Thơm, Gành Dầu, Cửa Cạn thành đặc khu có tên gọi là đặc khu Phú
 * Quốc" (thuộc tỉnh An Giang sau sáp nhập, khoản 97). Đối chiếu 2 nguồn độc lập, không mâu thuẫn
 * (Phase 2B): xaydungchinhsach.chinhphu.vn (Cổng Chính phủ, toàn văn) và thuvienphapluat.vn.
 *
 * Toạ độ cả 49 place (lat 9.955–10.385, lng 103.833–104.07) nằm trọn trong đảo Phú Quốc chính, cách
 * xa đặc khu Thổ Châu (~9.28°N/103.47°E) — nên GIÁ TRỊ GIỐNG NHAU cho toàn bộ danh sách không phải
 * rút gọn, mà là kết quả thật của việc luật chỉ vừa nhập toàn đảo (trừ Thổ Châu) thành MỘT đơn vị.
 *
 * GRAND WORLD (slug `grand-world-phu-quoc`) CỐ Ý VẮNG MẶT khỏi danh sách này. Phân loại hành chính
 * của nó (province="An Giang", admin_area="Đặc khu Phú Quốc") tự thân cũng CONFIRMED như 48 place
 * dưới đây — nhưng `address` hiện tại của nó lẫn cả định dạng cũ ("TP. Phú Quốc") lẫn tỉnh cũ
 * ("Kiên Giang") theo cách không nơi nào khác trong 49 place mắc phải (Phase 2B/4), và toàn bộ dòng
 * đó đã được xếp NEEDS_REVIEW (không phải chỉ riêng address) ở bước audit trước khi backfill này bắt
 * đầu. Quyết định (ghi rõ vì đây là lựa chọn diễn giải, không phải sự kiện khách quan): loại Grand
 * World khỏi ĐỢT NÀY — kể cả phần province/admin_area vốn an toàn — để không có bất kỳ ghi nào chạm
 * vào place này trước khi Owner duyệt address riêng, đúng tinh thần "không được tự ý sửa Grand World
 * ngoài phần đã được owner phê duyệt". Thêm Grand World vào mảng dưới đây (cùng shape, KHÔNG đổi
 * address) là cách chạy lại đợt backfill này cho nó sau khi được duyệt — script không cần sửa gì
 * khác, script vốn đã idempotent.
 */

export interface AdministrativeBackfillTarget {
  slug: string;
  province: string;
  adminArea: string;
}

const PROVINCE = 'An Giang';
const ADMIN_AREA = 'Đặc khu Phú Quốc';

export const ADMINISTRATIVE_BACKFILL_SOURCE = {
  externalRef: 'NQ-1654-NQ-UBTVQH15',
  title: 'Nghị quyết 1654/NQ-UBTVQH15 về việc sắp xếp các đơn vị hành chính cấp xã của tỉnh An Giang năm 2025',
  url: 'https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-quyet-so-1654-nq-ubtvqh15-sap-xep-cac-dvhc-cap-xa-cua-tinh-an-giang-nam-2025-119250616191813652.htm',
  publisher: 'Ủy ban Thường vụ Quốc hội',
  language: 'vi',
  // Ngày rehearsal Phase 2B đối chiếu văn bản — KHÔNG phải ngày văn bản có hiệu lực (01/7/2025).
  retrievedAt: '2026-08-18T00:00:00.000Z',
} as const;

// 48/49 place — Grand World loại trừ có chủ đích, xem chú thích đầu file.
export const ADMINISTRATIVE_BACKFILL_TARGETS: readonly AdministrativeBackfillTarget[] = [
  'dinh-cau',
  'cho-dem-phu-quoc',
  'sunset-cruise-phu-quoc',
  'fusion-resort-phu-quoc',
  'sailing-club-phu-quoc',
  'lang-chai-ham-ninh',
  'bai-khem',
  'tour-3-dao-an-thoi',
  'novotel-phu-quoc',
  'vinwonders-phu-quoc',
  'sunset-sanato-resort',
  'bao-tang-coi-nguon',
  'cong-ca-phe-phu-quoc',
  'lan-ngam-san-ho-hon-thom',
  'bai-sao',
  'bun-quay-kien-xay',
  'jw-marriott-phu-quoc',
  'bai-rach-vem',
  'sun-world-hon-thom',
  'premier-village-phu-quoc',
  'chua-ho-quoc',
  'suoi-tranh',
  'nha-hang-ra-khoi',
  'highlands-coffee-phu-quoc',
  'vinpearl-safari',
  'la-veranda-resort',
  'chuon-chuon-bistro',
  // grand-world-phu-quoc — LOẠI TRỪ, xem chú thích đầu file.
  'nha-tu-phu-quoc',
  'muong-thanh-luxury-phu-quoc',
  'bai-truong',
  'ocean-bay-phu-quoc-resort',
  'sonasea-phu-quoc',
  'cau-hon',
  'crab-house-phu-quoc',
  'bai-vong',
  'salinda-resort-phu-quoc',
  'bai-ong-lang',
  'vinpearl-resort-phu-quoc',
  'mui-ganh-dau',
  'spice-house-cassia-cottage',
  'bai-thom',
  'cho-ham-ninh',
  'bai-cua-can',
  'buddy-cafe',
  'suoi-da-ban',
  'cho-duong-dong',
  'nha-hang-xin-chao',
  'bai-dai',
].map((slug) => ({ slug, province: PROVINCE, adminArea: ADMIN_AREA }));
