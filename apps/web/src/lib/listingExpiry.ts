// Hạn tin (job_listings/real_estate_listings) — DÙNG CHUNG cho dashboard chủ tin/admin. Backend lọc
// tin hết hạn khỏi mọi đường đọc công khai tại THỜI ĐIỂM ĐỌC, không qua cron — xem
// job-listings.repository.ts/real-estate-listings.repository.ts. Bug thật đã sửa 2026-10-17: điều
// kiện đó trước đây so `expires_at >= CURRENT_DATE` (CURRENT_DATE theo timezone PHIÊN Postgres —
// xác nhận production là Etc/UTC, KHÔNG phải Asia/Ho_Chi_Minh), lệch tới 7 giờ/ngày với đúng cách
// `todayInVietnam()` ở đây tính "hôm nay". Nay cả hai phía đều dùng chung một quy ước: "hôm nay" =
// ngày theo Asia/Ho_Chi_Minh, API tính bằng `(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` ngay
// trong SQL, dashboard tính bằng hàm dưới đây — không còn hai định nghĩa "hôm nay" khác nhau.
//
// Module này KHÔNG đổi hành vi public (đã sửa ở repository, không phải ở đây), KHÔNG thêm trường DB
// nào — thuần tính toán phía client từ `status` + `expires_at` đã có sẵn trong mọi response hiện có.
//
// Ngưỡng "sắp hết hạn" (EXPIRING_SOON_DAYS) là một mốc cảnh báo UI thuần tuý, KHÁC với chính sách
// hạn mặc định/tối đa/giới hạn gia hạn (còn chờ owner quyết, xem checkpoint §Gói B) — đổi số này
// không cần quyết định chính sách đó trước.

import { useEffect, useState } from 'react';

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

/** Bug thật đã sửa 2026-10-17: `const today = todayInVietnam()` tính thẳng trong thân component chỉ
 *  chạy lại khi React tự re-render vì lý do KHÁC (đổi filter, tải lại danh sách...) — một dashboard
 *  mở từ trước nửa đêm và không ai đụng gì sẽ giữ nguyên nhãn/bộ lọc của ngày CŨ vô thời hạn, không
 *  tự cập nhật khi sang ngày mới. Hook này buộc re-render khi "hôm nay" thật sự đổi, bằng khoảng
 *  kiểm tra ngắn hơn nhiều so với một ngày — không cần biết chính xác giờ nửa đêm, không cần hẹn giờ
 *  phức tạp, chỉ cần không bỏ sót việc đổi ngày trong lúc tab vẫn mở. */
const TODAY_CHECK_INTERVAL_MS = 60_000;

export function useTodayInVietnam(): string {
  const [today, setToday] = useState(todayInVietnam);
  useEffect(() => {
    const id = setInterval(() => {
      setToday((prev) => {
        const next = todayInVietnam();
        return prev === next ? prev : next;
      });
    }, TODAY_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
  return today;
}
