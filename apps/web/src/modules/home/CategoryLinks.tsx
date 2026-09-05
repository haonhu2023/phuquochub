import Link from 'next/link';
import { localizedHref, type Locale } from '@/lib/locale';
import { getHomeCopy } from './home.copy';
import { CategoryIcon } from './CategoryIcons';
import styles from './home.module.css';

/**
 * Lối vào theo nhóm nội dung (V2 — Phase 7: "category discovery"). Mỗi mục trỏ tới một TRANG DUYỆT
 * CÓ THẬT trong ứng dụng (`app/[locale]/(public)/…`) — không phải một danh mục tuỳ ý dựng từ
 * `GET /categories`.
 *
 * V2 nâng cấp từ V1 (chỉ tên + một cụm ngắn) sang: icon SVG tự vẽ + tên + một câu giải thích ý
 * định ngắn + mũi tên hành động — vẫn CÙNG danh sách route/href, không thêm danh mục nào ngoài
 * taxonomy hiện có. Mọi mục vẫn là `<a>` thật, không cần JavaScript để điều hướng.
 *
 * Vì sao KHÔNG gọi `/categories` ở đây: các trang duyệt này là những trải nghiệm riêng đã được xây
 * (bộ lọc riêng, SEO riêng), không phải một danh sách category động; và giữ khối này TĨNH nghĩa là
 * nó không có trạng thái lỗi/rỗng nào — phần điều hướng chính của trang chủ không bao giờ phụ
 * thuộc vào một lời gọi API có thể hỏng.
 */
export function CategoryLinks({ locale }: { locale: Locale }) {
  const copy = getHomeCopy(locale);
  return (
    <section className={styles.section} aria-labelledby="home-categories-title">
      <div className={styles.sectionHead}>
        <h2 id="home-categories-title" className={styles.sectionTitle}>
          {copy.categoriesTitle}
        </h2>
        <Link href={localizedHref(locale, '/places')} className={styles.sectionLink}>
          {copy.categoriesAllLink}
        </Link>
      </div>

      <div className={styles.categoryGridV2}>
        {copy.categories.map((entry) => (
          <Link key={entry.href} href={localizedHref(locale, entry.href)} className={styles.categoryTileV2}>
            <span className={styles.categoryIconWrap}>
              <CategoryIcon href={entry.href} className={styles.categoryIcon} />
            </span>
            <span className={styles.categoryTileBody}>
              <span className={styles.categoryName}>{entry.name}</span>
              <span className={styles.categoryHint}>{entry.hint}</span>
            </span>
            <span className={styles.categoryArrow} aria-hidden="true">
              →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
