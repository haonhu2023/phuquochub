import Link from 'next/link';
import placeStyles from '@/modules/places/places.module.css';
import type { BusinessClaimStatusValue } from './types';

// Phần dùng chung giữa hàng đợi duyệt claim (ClaimsReviewView) và trang chi tiết
// (ClaimReviewDetail) — tách ra để hai màn hình không lệch nhau về nhãn/định dạng/thông điệp 403.

/**
 * Trạng thái 403 cho hàng đợi duyệt claim. Cùng khuôn `ForbiddenState` của module moderation:
 * quyền được cưỡng chế Ở BACKEND (`Business.Verify`), FE chỉ diễn giải 403 cho người dùng —
 * KHÔNG tự phán đoán quyền từ session (session hiện chưa lộ permission nào).
 */
export function ClaimsForbiddenState() {
  return (
    <div className={placeStyles.state} role="alert">
      <p className={placeStyles.stateTitle}>Không có quyền truy cập</p>
      <p>
        Bạn không có quyền <code>Business.Verify</code> để duyệt yêu cầu xác nhận quyền quản lý. Nếu
        cho rằng đây là nhầm lẫn, liên hệ quản trị viên.
      </p>
      <Link href="/dashboard" className={placeStyles.btn}>
        ← Về bảng điều khiển
      </Link>
    </div>
  );
}

/**
 * Ánh xạ trạng thái claim -> class badge CÓ SẴN trong place-management.module.css (statusPublished/
 * statusPending/statusArchived/statusDraft) — tái dùng thay vì thêm bảng màu thứ hai cho cùng ý
 * nghĩa "tốt / đang chờ / kết thúc tiêu cực". `styles` truyền vào để module CSS được import ở đúng
 * nơi dùng (CSS Modules sinh tên class theo từng file import).
 */
export function claimStatusClass(
  status: BusinessClaimStatusValue,
  styles: Record<string, string>,
): string {
  switch (status) {
    case 'approved':
      return styles.statusPublished;
    case 'rejected':
    case 'disputed':
      return styles.statusArchived;
    case 'withdrawn':
      return styles.statusDraft;
    default:
      return styles.statusPending;
  }
}

/** Ngày giờ gửi/quyết định — vi-VN, kèm giờ (hàng đợi cần phân biệt các yêu cầu trong cùng ngày). */
export function formatClaimDate(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
