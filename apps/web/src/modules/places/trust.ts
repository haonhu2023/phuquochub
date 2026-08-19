import type { PlaceTrustSource, VerificationStatusValue } from '@phuquochub/shared-types';

/**
 * Đọc `verification_status`/`verified_at`/`trust_sources` thành thứ hiển thị được (Place Trust &
 * Freshness Surface, 2026-08-19).
 *
 * VÌ SAO FILE NÀY TỒN TẠI: trước đây trang chi tiết và các thẻ (PlaceCard/BeachCard/AttractionCard)
 * đều tự kiểm `verification_status === 'verified'` để quyết định có hiện badge "Đã xác minh" hay
 * không — bỏ sót HAI trạng thái tin cậy khác (`official`, `community_verified`), lặp lại logic đó
 * ở BỐN nơi khác nhau theo bốn cách hơi khác nhau. Backend đã có định nghĩa "trạng thái tin cậy"
 * đúng (`isTrustedStatus()`, verification.transition.ts) — file này là bản tương đương phía web,
 * MỘT định nghĩa dùng chung, để không còn nơi nào tự đoán lại.
 *
 * NGUYÊN TẮC ĐỘ MỚI (freshness): hệ thống ĐÃ CÓ chính sách hết hạn (verification.md §7/§10 mục 3 —
 * `expires_at` + job `expireOverdue()` hạ `{verified,official,community_verified} → expired`).
 * File này KHÔNG tự đặt một ngưỡng số-ngày nào ở phía client — `verification_status = 'expired'`
 * CHÍNH LÀ tín hiệu "đã lâu chưa xác minh lại", đã được backend tính sẵn. Trạng thái còn đang
 * `verified`/`official`/`community_verified` nghĩa là CHƯA hết hạn theo đúng chính sách đó (nếu đã
 * hết hạn, job đã hạ nó xuống `expired` rồi) — không cần suy đoán thêm gì ở đây.
 */

const TRUSTED_STATUSES: ReadonlySet<VerificationStatusValue> = new Set([
  'verified',
  'official',
  'community_verified',
]);

export function isTrustedVerification(status: VerificationStatusValue): boolean {
  return TRUSTED_STATUSES.has(status);
}

/** Ba trạng thái hiển thị — KHÔNG phải bốn: `pending`/`rejected` gộp chung `unverified` (Phase 2A
 *  chỉ hỏi nhị phân "Đã xác minh"/"Chưa xác minh"; không có ô riêng cho "bị từ chối"). */
export type TrustBadge = 'verified' | 'stale' | 'unverified';

export function getTrustBadge(status: VerificationStatusValue): TrustBadge {
  if (isTrustedVerification(status)) return 'verified';
  if (status === 'expired') return 'stale';
  return 'unverified';
}

/**
 * Nhãn ngắn cho badge. Cố ý KHÔNG dùng "Đã xác minh chính thức" cho trạng thái `official` — dù
 * tên ENUM trùng khớp, đó là cụm từ bị cấm (task brief Phần 3): tạo cảm giác bảo đảm pháp lý mà
 * hệ thống không chứng minh được. Cả ba trạng thái tin cậy dùng CHUNG một nhãn.
 */
export const TRUST_BADGE_LABEL: Record<TrustBadge, string> = {
  verified: 'Đã xác minh',
  stale: 'Đã lâu chưa xác minh lại',
  unverified: 'Chưa xác minh',
};

/** Định dạng ngày theo vi-VN (cùng quy ước `reviews/format.ts` — không giờ, MVP không cần phút giây). */
export function formatVerifiedAt(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/** Tên hiển thị cho một trường đã được đối chiếu nguồn — KHÔNG lộ tên cột kỹ thuật ra UI. */
const FIELD_LABELS: Record<string, string> = {
  province: 'đơn vị hành chính',
  admin_area: 'đơn vị hành chính',
  address: 'địa chỉ',
  ward: 'khu vực',
  opening_hours: 'giờ mở cửa',
  price_range: 'mức giá',
  description: 'mô tả',
  name: 'tên địa điểm',
};

export interface TrustSourceSummary {
  /** "Thông tin được đối chiếu với nguồn: {publisher}." hoặc "...với N nguồn." — null nếu không có nguồn nào. */
  label: string | null;
  /** Chỉ có khi đúng MỘT nguồn khác biệt và nguồn đó có url. */
  url: string | null;
}

/**
 * Rút gọn `trust_sources` (có thể nhiều dòng, mỗi dòng ứng một TRƯỜNG) thành MỘT dòng hiển thị.
 *
 * Gộp theo publisher (không theo field): với dữ liệu thật hôm nay, một đợt đối chiếu hành chính ghi
 * NHIỀU field (`province`, `admin_area`) nhưng CÙNG một nguồn — hiển thị "2 nguồn" ở đây sẽ SAI,
 * phóng đại số nguồn thật sự đứng sau. Nếu có publisher trống (`null`) và có publisher đặt tên, ưu
 * tiên hiển thị publisher có tên (một nguồn đã ghi publisher hữu ích hơn để hiện ra người đọc).
 */
export function summarizeTrustSources(sources: readonly PlaceTrustSource[]): TrustSourceSummary {
  if (sources.length === 0) return { label: null, url: null };

  const named = sources.filter((s) => s.publisher);
  const distinctPublishers = [...new Set(named.map((s) => s.publisher as string))];

  if (distinctPublishers.length === 0) {
    // Có attribution nhưng không nguồn nào ghi publisher — không bịa tên, chỉ nói có đối chiếu.
    return { label: 'Một số thông tin đã được đối chiếu với nguồn tham khảo.', url: null };
  }

  if (distinctPublishers.length === 1) {
    const match = named.find((s) => s.publisher === distinctPublishers[0])!;
    return {
      label: `Thông tin được đối chiếu với nguồn: ${distinctPublishers[0]}.`,
      url: match.url,
    };
  }

  return { label: `Thông tin được đối chiếu với ${distinctPublishers.length} nguồn khác nhau.`, url: null };
}

/** Nhãn tiếng Việt cho tên trường kỹ thuật — dùng nếu cần liệt kê field cụ thể; fallback trung tính. */
export function fieldLabel(field: string | null): string {
  if (!field) return 'thông tin';
  return FIELD_LABELS[field] ?? 'thông tin';
}
