import Link from 'next/link';
import styles from '@/modules/places/places.module.css';

// Hiển thị khi API xác nhận địa điểm không tồn tại (getPlace → 404 → notFound()).
export default function PlaceNotFound() {
  return (
    <div className={styles.state} role="alert">
      <p className={styles.stateTitle}>Không tìm thấy địa điểm</p>
      <p>Địa điểm bạn tìm không tồn tại hoặc đã bị gỡ.</p>
      <Link href="/places" className={styles.btn}>
        ← Về danh sách địa điểm
      </Link>
    </div>
  );
}
