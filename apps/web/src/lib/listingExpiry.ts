// Hạn tin (job_listings/real_estate_listings) — DÙNG CHUNG cho dashboard chủ tin/admin. Backend đã
// lọc tin hết hạn khỏi mọi đường đọc công khai từ trước (so sánh `expiresAt >= CURRENT_DATE` tại
// thời điểm đọc, không qua cron — xem job-listings.repository.ts/real-estate-listings.repository.ts).
// Phần còn thiếu CHỈ là hiển thị: dashboard chưa từng cho chủ tin/admin THẤY ngày hết hạn hay biết
// vì sao một tin published không còn hiện công khai. Module này KHÔNG đổi hành vi public, KHÔNG
// thêm trường DB nào — thuần tính toán phía client từ `status` + `expires_at` đã có sẵn trong mọi
// response hiện có.
//
// Ngưỡng "sắp hết hạn" (EXPIRING_SOON_DAYS) là một mốc cảnh báo UI thuần tuý, KHÁC với chính sách
// hạn mặc định/tối đa/giới hạn gia hạn (còn chờ owner quyết, xem checkpoint §Gói B) — đổi số này
// không cần quyết định chính sách đó trước.

export const EXPIRING_SOON_DAYS = 7;

/** "Hôm nay" theo múi giờ Asia/Ho_Chi_Minh, dạng YYYY-MM-DD — so khớp đúng kiểu cột `expires_at`
 *  (Postgres `date`, không có giờ/múi giờ riêng). Không dùng giờ máy chủ/trình duyệt trực tiếp: hai
 *  nơi đó có thể lệch múi giờ, làm "hôm nay" sai lệch quanh nửa đêm UTC/VN. */
export function todayInVietnam(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

/** Số ngày từ `fromYmd` tới `toYmd` (cả hai dạng YYYY-MM-DD, không âm nếu `toYmd` ở tương lai).
 *  Parse theo UTC-midnight cho cả hai vế — an toàn vì chỉ cần HIỆU số ngày, không cần giờ thật;
 *  Việt Nam không có DST nên không lệch theo mùa. */
function daysBetween(fromYmd: string, toYmd: string): number {
  const from = Date.parse(`${fromYmd}T00:00:00Z`);
  const to = Date.parse(`${toYmd}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

export type ListingEffectiveStatus = 'expired' | 'expiring_soon' | null;

/** `null` nghĩa là "không có trạng thái hạn đáng chú ý" — tin chưa published (hạn chưa có ý nghĩa
 *  public), hoặc không đặt hạn, hoặc còn hạn xa (ngoài `EXPIRING_SOON_DAYS`). */
export function listingEffectiveStatus(
  status: string,
  expiresAt: string | null,
  today: string = todayInVietnam(),
): ListingEffectiveStatus {
  if (status !== 'published' || !expiresAt) return null;
  if (expiresAt < today) return 'expired';
  if (daysBetween(today, expiresAt) <= EXPIRING_SOON_DAYS) return 'expiring_soon';
  return null;
}

export const LISTING_EFFECTIVE_STATUS_LABELS: Record<'expired' | 'expiring_soon', string> = {
  expired: 'Đã hết hạn',
  expiring_soon: 'Sắp hết hạn',
};

/** Bộ lọc dashboard kết hợp cả `status` thật lẫn trạng thái hạn suy ra — "sắp hết hạn"/"hết hạn"
 *  không phải giá trị `status` thật (status vẫn là `published`), nên lọc ở client sau khi tải toàn
 *  bộ danh sách (đã tải hết mọi trạng thái từ trước — không cần tham số lọc mới ở API). */
export type ListingFilterValue = 'all' | 'draft' | 'pending' | 'published' | 'expiring_soon' | 'expired' | 'closed' | 'rejected';

export function matchesListingFilter<T extends { status: string; expires_at: string | null }>(
  item: T,
  filter: ListingFilterValue,
  today: string = todayInVietnam(),
): boolean {
  if (filter === 'all') return true;
  if (filter === 'expiring_soon' || filter === 'expired') {
    return listingEffectiveStatus(item.status, item.expires_at, today) === filter;
  }
  return item.status === filter;
}
