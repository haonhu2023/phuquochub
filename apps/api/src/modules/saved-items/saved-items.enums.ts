// Đa hình, enum ĐÓNG — xem migration InitSavedItems cho lý do không dùng text tự do/FK cứng.
// Thêm loại entity mới = thêm một giá trị ở đây + một migration ALTER TYPE + một case trong
// SavedItemsService.resolveTarget() — KHÔNG đụng tới moderation_target_type (khác hệ thống).
export enum SavedItemTargetType {
  JOB_LISTING = 'job_listing',
  REAL_ESTATE_LISTING = 'real_estate_listing',
}
