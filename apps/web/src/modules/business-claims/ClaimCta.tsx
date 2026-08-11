import Link from 'next/link';
import styles from './business-claims.module.css';

interface Props {
  placeId: string;
  placeName: string;
}

// CTA trên trang chi tiết Place công khai (PLACE-042, Phase 5 phương án A). Trang này CHỈ render
// Place đã `published` (getBySlug/getPlace công khai lọc status) — nên CTA hiển thị KHÔNG ĐIỀU
// KIỆN là an toàn, chưa cần biết người xem đã đăng nhập hay chưa: liên kết trỏ tới route trong
// (dashboard) — RouteGuard ở đó tự chuyển hướng người chưa đăng nhập sang /login?next=... (không
// cần logic auth lặp lại ở đây). `place_id`/`place_name` truyền qua query string CHỈ để điền sẵn
// form — KHÔNG được tin cậy cho bất kỳ quyết định nào; POST /business-claims luôn xác thực lại
// place_id ở backend (tồn tại + đã published) trước khi tạo claim.
export function ClaimCta({ placeId, placeName }: Props) {
  const href = `/dashboard/business-claims/new?place_id=${encodeURIComponent(placeId)}&place_name=${encodeURIComponent(placeName)}`;
  return (
    <div className={styles.claimBanner}>
      <p className={styles.claimBannerText}>Bạn là chủ địa điểm này? Xác nhận quyền quản lý để chỉnh sửa thông tin.</p>
      <Link href={href} className={styles.claimBannerLink}>
        Xác nhận quyền quản lý
      </Link>
    </div>
  );
}
