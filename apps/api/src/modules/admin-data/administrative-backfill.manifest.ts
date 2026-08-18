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
 * GRAND WORLD (slug `grand-world-phu-quoc`) — CÓ MẶT trong danh sách này (khác quyết định của đợt
 * backfill trước, xem lịch sử file). Owner đã phê duyệt tường minh (2026-08-18): "đối với 49
 * Places, province/admin_area phải được cập nhật theo administrative reality hiện hành" — không
 * còn lý do giữ Grand World ngoài phạm vi CHO HAI FIELD NÀY, vì phân loại hành chính của nó suy ra
 * từ CÙNG một lý lẽ như 48 place kia (toạ độ 10.328,103.855 nằm trong xã Gành Dầu cũ, nay thuộc
 * đặc khu Phú Quốc) — không phụ thuộc gì vào chuỗi `address` lộn xộn của nó.
 *
 * `address` của Grand World VẪN KHÔNG được sửa trong danh sách này (script không có cơ chế nào
 * ghi address cả — xem administrative-backfill.service.ts, PATCH chỉ chứa province/admin_area).
 * Đã thử tìm nguồn xác minh cách viết đúng (2026-08-18): mọi kết quả tìm được đều là blog du
 * lịch/trang thương mại (dulichvietnam.com.vn, vinwonders.com/wonderpedia, Klook blog, Facebook,
 * grandworldphuquoc.vn…) — đúng loại nguồn Section 3 cấm dùng làm căn cứ pháp lý, và bản thân
 * chúng còn dùng thuật ngữ CŨ ("Kiên Giang", "Gành Dầu ward") — nếu copy lại sẽ đưa dữ liệu sai
 * MỚI vào thay vì sửa dữ liệu sai CŨ. Kết luận: không đủ căn cứ để viết lại address — giữ
 * NEEDS_REVIEW cho riêng field này, đúng nhánh fallback ở Section 6 của brief.
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

// 49/49 place — Grand World CÓ MẶT (province/admin_area only; xem chú thích đầu file vì sao
// address của nó không nằm trong phạm vi field mà script này ghi).
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
  'grand-world-phu-quoc',
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
