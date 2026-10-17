// "Hôm nay" theo giờ Việt Nam — CÙNG quy ước `(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` dùng
// trong JobListingsRepository/RealEstateListingsRepository.publicQuery() (bug thật đã sửa
// 2026-10-17, xem ghi chú ở đó) và `todayInVietnam()` phía web (apps/web/src/lib/listingExpiry.ts).
// Dùng để validate `expires_at` (chuỗi YYYY-MM-DD) ngay lúc ghi — so sánh chuỗi trực tiếp, không
// qua đối tượng Date (tránh lệch ngày theo timezone máy chạy, cùng lý do các nơi khác trong repo
// tránh `new Date(iso).toISOString()` cho cột `date`).
export function todayInVietnam(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}
