import Link from 'next/link';
import styles from '@/modules/business-claims/business-claims.module.css';

interface Props {
  placeId: string;
  placeName: string;
}

// CTA "Báo thông tin sai" trên trang chi tiết Place công khai — cùng khuôn ClaimCta.tsx
// (business-claims). Trang chi tiết CHỈ render Place đã `published` nên hiển thị CTA không điều
// kiện là an toàn; route đích nằm trong (dashboard), RouteGuard ở đó tự chuyển hướng người chưa
// đăng nhập sang /login?next=... Tái dùng CSS của business-claims (cùng kiểu banner phẳng dưới
// tiêu đề) thay vì tạo một module CSS mới cho một banner giống hệt về hình dạng.
export function ReportPlaceCta({ placeId, placeName }: Props) {
  const href = `/dashboard/places/report?place_id=${encodeURIComponent(placeId)}&place_name=${encodeURIComponent(placeName)}`;
  return (
    <div className={styles.claimBanner}>
      <p className={styles.claimBannerText}>Thấy thông tin không đúng?</p>
      <Link href={href} className={styles.claimBannerLink}>
        Báo thông tin sai
      </Link>
    </div>
  );
}
