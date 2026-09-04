// Nhãn tiếng Việt cho Human Translation Review — người duyệt KHÔNG thấy field kỹ thuật
// (is_public/is_production_data/production_eligible) như control chính; chỉ thấy trạng thái duyệt
// dễ hiểu (Phase 10).

export function labelOf(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}

export const HUMAN_REVIEW_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Chờ duyệt',
  NEEDS_CHANGES: 'Cần sửa lại',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Đã từ chối',
};

export const FIELD_KEY_LABELS: Record<string, string> = {
  display_name: 'Tên hiển thị',
  short_description: 'Mô tả ngắn',
};

export const LOCALE_LABELS: Record<string, string> = {
  vi: 'Tiếng Việt',
  en: 'Tiếng Anh',
};

export const TRANSLATION_METHOD_LABELS: Record<string, string> = {
  original: 'Nội dung gốc',
  human: 'Người dịch',
  ai_plus_human: 'AI + người duyệt',
  official_or_human: 'Nguồn chính thức / người dịch',
};

// ISO -> chuỗi ngày giờ dễ đọc; nếu parse lỗi thì trả nguyên chuỗi (không ném, không "Invalid Date").
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
