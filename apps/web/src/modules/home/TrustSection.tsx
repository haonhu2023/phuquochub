import { getHomeCopy } from './home.copy';
import { type Locale } from '@/lib/locale';
import styles from './home.module.css';

/**
 * Khối tin cậy (map/home upgrade) — trả lời "vì sao tin PhuQuocHub" bằng đúng những gì sản phẩm
 * THẬT SỰ làm, không phải khẩu hiệu marketing:
 *   - mỗi bản dịch/nội dung đi qua nguồn tham chiếu (`sources`/`source_attributions`, ADR-008);
 *   - nội dung được rà soát liên tục (revisions/kiểm duyệt đã có trong hệ thống);
 *   - trạng thái "đang xác minh" hiển thị NGUYÊN VĂN thay vì trộn lẫn với dữ liệu đã xác minh
 *     (cùng nguyên tắc `resolvePriceDisplay`/trust badge dùng ở PlaceCard và popup bản đồ).
 * Không có tuyên bố nào ở đây mà ứng dụng không thực sự làm — cố ý không nói "100% xác minh" hay
 * tương tự vì đó không phải trạng thái thật của dữ liệu hiện tại (verification_status='pending'
 * trên phần lớn 49 địa điểm hiện có).
 */
export function TrustSection({ locale }: { locale: Locale }) {
  const copy = getHomeCopy(locale);
  return (
    <section className={styles.section} aria-labelledby="home-trust-title">
      <h2 id="home-trust-title" className={styles.sectionTitle}>
        {copy.trustTitle}
      </h2>
      <div className={styles.trustGrid}>
        {copy.trustPoints.map((point) => (
          <div key={point.title} className={styles.trustCard}>
            <p className={styles.trustCardTitle}>{point.title}</p>
            <p className={styles.trustCardBody}>{point.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
