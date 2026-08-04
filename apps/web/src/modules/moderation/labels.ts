// Nhãn tiếng Việt cho các enum Moderation (hiển thị). Tách khỏi component để test thuần + tái dùng.
// `labelOf` trả chính key nếu thiếu ánh xạ (phòng thủ khi backend thêm giá trị enum mới) — không
// bao giờ ném, không bao giờ hiện "undefined".

export function labelOf(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}

export const CASE_STATUS_LABELS: Record<string, string> = {
  open: 'Đang mở',
  claimed: 'Đang xử lý',
  resolved: 'Đã xử lý',
  dismissed: 'Đã bỏ qua',
};

export const TARGET_TYPE_LABELS: Record<string, string> = {
  review: 'Đánh giá',
  media: 'Hình ảnh',
  place: 'Địa điểm',
};

export const SOURCE_LABELS: Record<string, string> = {
  new_content: 'Nội dung mới',
  report: 'Bị báo cáo',
  ai_flag: 'AI gắn cờ',
  manual: 'Thủ công',
};

export const SEVERITY_LABELS: Record<string, string> = {
  low: 'Thấp',
  normal: 'Bình thường',
  high: 'Cao',
  critical: 'Nghiêm trọng',
};

export const DECISION_LABELS: Record<string, string> = {
  approve: 'Duyệt',
  reject: 'Từ chối',
  hide: 'Ẩn',
  restore: 'Khôi phục',
  dismiss: 'Bỏ qua',
};

export const REPORT_REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  misinformation: 'Sai lệch thông tin',
  offensive: 'Phản cảm',
  irrelevant: 'Không liên quan',
  copyright: 'Vi phạm bản quyền',
  personal_info: 'Lộ thông tin cá nhân',
  other: 'Khác',
};

export const REPORT_STATUS_LABELS: Record<string, string> = {
  open: 'Đang mở',
  upheld: 'Chấp nhận',
  dismissed: 'Bỏ qua',
};

export const MEDIA_STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ duyệt',
  published: 'Đã công khai',
  hidden: 'Đã ẩn',
  rejected: 'Đã từ chối',
};

export const REVIEW_STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ duyệt',
  published: 'Đã công khai',
  hidden: 'Đã ẩn',
};
