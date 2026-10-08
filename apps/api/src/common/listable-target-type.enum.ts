// Đăng ký loại entity "có thể lưu/báo cáo" dùng CHUNG giữa saved_items VÀ listing_reports (tách ra
// khi xuất hiện CONSUMER THỨ HAI — đúng nguyên tắc "chỉ tách phần dùng chung khi có nhu cầu thực",
// 2026-10-08). KHÔNG phải `ModerationTargetType` (moderation.enums.ts) — enum đó bị khoá đúng 3
// loại theo ADR-018 §D9/MR-4 (review/media/place), mở rộng nó là sửa ADR. Enum NÀY không bị ràng
// buộc gì — thêm loại entity lưu/báo-cáo được mới chỉ cần thêm một giá trị + một migration ALTER
// TYPE, không đụng quyết định kiểm duyệt nào.
export enum ListableTargetType {
  JOB_LISTING = 'job_listing',
  REAL_ESTATE_LISTING = 'real_estate_listing',
}
