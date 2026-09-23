import type { Locale } from '@/lib/locale';

// Nhãn hiển thị tiếng Việt cho mức giá. Dùng chung cho PlaceCard + trang chi tiết
// để tránh lặp switch mapping ở nhiều nơi.

// Presentation whitelist — KHÔNG phải database contract.
// FE contract (types.ts) hiện chỉ khai báo price_range: string | null, không có union.
// Danh sách dưới đây chỉ liệt kê các giá trị mà UI biết cách hiển thị; derive type từ
// chính danh sách để tránh khai báo union trùng lặp / hai nguồn định nghĩa enum.
const PRICE_RANGES = ['free', 'low', 'mid', 'high'] as const;
type PriceRange = (typeof PRICE_RANGES)[number];

// Record ép exhaustive: thêm/bớt giá trị trong PRICE_RANGES sẽ báo lỗi type nếu quên map.
const PRICE_RANGE_LABELS: Record<PriceRange, string> = {
  free: 'Miễn phí',
  low: 'Bình dân',
  mid: 'Tầm trung',
  high: 'Cao cấp',
};

// X1 (2026-09-22, G10) — additive: `PRICE_RANGE_LABELS` ở trên GIỮ NGUYÊN (9 nơi gọi khác — mọi
// thẻ hub/bản đồ — vẫn tiếng Việt, một khoảng trống i18n rộng hơn cố ý CHƯA sửa trong đợt này).
const PRICE_RANGE_LABELS_EN: Record<PriceRange, string> = {
  free: 'Free',
  low: 'Budget',
  mid: 'Mid-range',
  high: 'High-end',
};

// Nhận input tương thích FE contract (string | null | undefined).
// Trả null khi không có giá trị hoặc giá trị ngoài whitelist (không hiển thị raw enum).
// `locale` tuỳ chọn, mặc định `'vi'` — GIỮ NGUYÊN hành vi cho 9 nơi gọi khác chưa truyền locale;
// `places/[slug]/page.tsx` truyền `locale` tường minh (G10).
export function formatPriceRange(value: string | null | undefined, locale: Locale = 'vi'): string | null {
  if (!value) return null;
  const labels = locale === 'en' ? PRICE_RANGE_LABELS_EN : PRICE_RANGE_LABELS;
  return labels[value as PriceRange] ?? null;
}
