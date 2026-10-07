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
