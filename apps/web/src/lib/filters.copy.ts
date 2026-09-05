import type { Locale } from './locale';

// Copy CHUNG cho phần chrome của bộ lọc/toolbar trên các trang duyệt công khai (hotels/
// restaurants/tours/attractions/beaches/search) — trước bản này, "Sắp xếp"/"Khu vực"/"Mức giá"/
// "Tất cả" và các nhãn sort/price_range đều là chuỗi tiếng Việt cứng trong từng `*Filters.tsx`,
// hiển thị y nguyên trên `/en/...`. Đây là NHÃN GIAO DIỆN (không phải dữ liệu thực thể) nên có thể
// dịch ngay, không vướng "chưa có bản dịch được duyệt" như place/hotel/restaurant/tour content.

export interface FilterChromeCopy {
  sortLabel: string;
  areaLabel: string;
  priceLabel: string;
  allOption: string;
}

const FILTER_CHROME: Record<Locale, FilterChromeCopy> = {
  vi: { sortLabel: 'Sắp xếp', areaLabel: 'Khu vực', priceLabel: 'Mức giá', allOption: 'Tất cả' },
  en: { sortLabel: 'Sort by', areaLabel: 'Area', priceLabel: 'Price', allOption: 'All' },
};

export function getFilterChrome(locale: Locale): FilterChromeCopy {
  return FILTER_CHROME[locale];
}

// 4 giá trị enum `price_range` DÙNG CHUNG cho mọi entity (hotels/restaurants/tours/attractions/
// beaches/search) — một nguồn duy nhất để 6 file filter không lặp lại (và không lệch nhau) cùng
// một bản dịch.
export type PriceRangeValue = 'free' | 'low' | 'mid' | 'high';

export const PRICE_RANGE_LABELS: Record<Locale, Record<PriceRangeValue, string>> = {
  vi: { free: 'Miễn phí', low: 'Bình dân', mid: 'Tầm trung', high: 'Cao cấp' },
  en: { free: 'Free', low: 'Budget', mid: 'Mid-range', high: 'High-end' },
};

// Nhãn sort DÙNG CHUNG cho các giá trị xuất hiện ở nhiều entity (`rating_desc`/`name_asc`/
// `newest`) — mỗi filter component tự chọn đúng tập con nó cần, KHÔNG bắt các entity không có
// `newest` (hotels/restaurants) phải hiển thị lựa chọn đó.
export const COMMON_SORT_LABELS: Record<Locale, { rating_desc: string; name_asc: string; newest: string }> = {
  vi: { rating_desc: 'Đánh giá cao nhất', name_asc: 'Tên A → Z', newest: 'Mới thêm gần đây' },
  en: { rating_desc: 'Highest rated', name_asc: 'Name A → Z', newest: 'Newest first' },
};
