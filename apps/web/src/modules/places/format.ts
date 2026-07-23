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

// Nhận input tương thích FE contract (string | null | undefined).
// Trả null khi không có giá trị hoặc giá trị ngoài whitelist (không hiển thị raw enum).
export function formatPriceRange(value: string | null | undefined): string | null {
  if (!value) return null;
  return PRICE_RANGE_LABELS[value as PriceRange] ?? null;
}
