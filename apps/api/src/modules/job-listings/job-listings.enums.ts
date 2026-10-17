export enum JobListingStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  PUBLISHED = 'published',
  REJECTED = 'rejected',
  CLOSED = 'closed',
}

export enum JobListingEmploymentType {
  FULL_TIME = 'full_time',
  PART_TIME = 'part_time',
  SEASONAL = 'seasonal',
}

// Kỳ tính lương — KHÔNG suy đoán. Thiếu thì null ("chưa rõ"), không mặc định 'month'.
export enum JobListingSalaryPeriod {
  HOUR = 'hour',
  DAY = 'day',
  MONTH = 'month',
}

export const JOB_LISTING_STATUS_LABELS: Record<JobListingStatus, string> = {
  [JobListingStatus.DRAFT]: 'Nháp',
  [JobListingStatus.PENDING]: 'Đang chờ duyệt',
  [JobListingStatus.PUBLISHED]: 'Đang đăng',
  [JobListingStatus.REJECTED]: 'Bị từ chối',
  [JobListingStatus.CLOSED]: 'Đã đóng',
};

// Gói C (17/10/2026) — vòng đời bản dịch tiếng Anh, CÙNG vocabulary nhưng MỘT state machine RIÊNG
// với JobListingStatus ở trên (độc lập hoàn toàn — một tin published tiếng Việt có thể có bản dịch
// đang draft/pending/rejected, và ngược lại). KHÔNG có 'closed' — một bản dịch không "đóng", nó chỉ
// đơn giản không được phục vụ công khai khi tin gốc đóng/hết hạn (kiểm ở tin gốc, không ở đây).
export enum JobListingTranslationStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  PUBLISHED = 'published',
  REJECTED = 'rejected',
}
