import type { PlaceMedia } from './types';
import styles from './places.module.css';

interface Props {
  media: PlaceMedia[];
  /** Dùng làm alt fallback khi ảnh không có `alt_text`/`caption` riêng. */
  placeName: string;
}

/**
 * Gallery ảnh công khai của MỘT place — tách ra (2026-09-17, real-data pass) từ
 * `places/[slug]/page.tsx` để `hotels`/`restaurants`/`tours` (mỗi loại có `[slug]/page.tsx` VÀ
 * `getXxx()` RIÊNG, đều trả về `PlaceDetail & {...}` nên đều có `media`) render ĐÚNG những ảnh đã
 * qua kiểm duyệt mà content_owner/kiểm duyệt viên đã duyệt, thay vì luôn hiện trang trống dù ảnh có
 * thật (phát hiện được khi audit dữ liệu thật: `la-veranda-resort` có đúng 1 ảnh `published` nhưng
 * trang khách sạn của nó trước đây không có khối gallery nào để hiển thị nó — chỉ trang
 * `/places/{slug}` chung mới có). MỘT nguồn logic gallery/ghi công duy nhất cho cả bốn route,
 * không còn bốn bản sao có thể lệch nhau theo thời gian.
 *
 * `place.media` từ API chỉ CHỨA ảnh đã `published` (route công khai tự lọc) — component này không
 * tự lọc lại theo `status`, và không có nhánh nào cho pending/draft: không có gì để "ẩn thêm".
 */
export function PlaceGallery({ media, placeName }: Props) {
  if (media.length === 0) return null;
  return (
    <div className={styles.gallery}>
      {media.map((m) => (
        <figure key={m.id} className={styles.galleryFigure}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ảnh host bên ngoài; next/image cần remotePatterns (ngoài phạm vi). */}
          <img
            className={styles.galleryImg}
            src={m.thumbnail_url ?? m.url}
            alt={m.alt_text ?? m.caption ?? placeName}
            loading="lazy"
          />
          <MediaCredit media={m} />
        </figure>
      ))}
    </div>
  );
}

/**
 * Dòng ghi công ảnh.
 *
 * Với `license_type = 'open_license'` (CC BY/BY-SA), hiển thị credit + link giấy phép LÀ điều kiện
 * được phép dùng ảnh — không phải chi tiết trang trí. Vì thế nó render ngay dưới ảnh, luôn nhìn
 * thấy được, không giấu trong `title`/tooltip.
 *
 * Không có `attribution` thì không render gì: các cơ sở khác (ảnh do chủ cơ sở cung cấp, ảnh
 * người dùng đăng, ảnh thuộc phạm vi công cộng) không đòi ghi công, và bịa ra một dòng credit
 * trống chỉ làm nhiễu.
 */
function MediaCredit({ media }: { media: PlaceMedia }) {
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
