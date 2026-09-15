import type { PlaceMedia } from './types';
import styles from './places.module.css';

/**
 * Dòng ghi công ảnh — dùng chung cho mọi trang chi tiết có gallery media (place, hotel).
 *
 * Với `license_type = 'open_license'` (CC BY/BY-SA), hiển thị credit + link giấy phép LÀ điều kiện
 * được phép dùng ảnh — không phải chi tiết trang trí. Vì thế nó render ngay dưới ảnh, luôn nhìn
 * thấy được, không giấu trong `title`/tooltip.
 *
 * Không có `attribution` thì không render gì: các cơ sở khác (ảnh do chủ cơ sở cung cấp, ảnh
 * người dùng đăng, ảnh thuộc phạm vi công cộng) không đòi ghi công, và bịa ra một dòng credit
 * trống chỉ làm nhiễu.
 */
export function MediaCredit({ media }: { media: PlaceMedia }) {
  if (!media.attribution) return null;
  return (
    <figcaption className={styles.mediaCredit}>
      {media.attribution}
      {media.license_url && (
        <>
          {' · '}
          <a href={media.license_url} target="_blank" rel="noopener noreferrer nofollow">
            Giấy phép
          </a>
        </>
      )}
    </figcaption>
  );
}
