import Link from 'next/link';
import { localizedHref, type Locale } from '@/lib/locale';
import { getHomeCopy } from './home.copy';
import styles from './home.module.css';

/**
 * Lối vào theo nhóm nội dung. Mỗi mục trỏ tới một TRANG DUYỆT CÓ THẬT trong ứng dụng
 * (`app/(public)/…`) — không phải một danh mục tuỳ ý dựng từ `GET /categories`.
 *
 * Vì sao KHÔNG gọi `/categories` ở đây: các trang duyệt này là những trải nghiệm riêng đã được xây
 * (bộ lọc riêng, SEO riêng), không phải một danh sách category động; và giữ khối này TĨNH nghĩa là
 * nó không có trạng thái lỗi/rỗng nào — phần điều hướng chính của trang chủ không bao giờ phụ
 * thuộc vào một lời gọi API có thể hỏng.
 *
 * Danh sách route + nhãn nay sống ở `home.copy.ts` (theo locale) — danh sách PHẢI khớp route thật;
 * thêm mục mà không có trang tương ứng sẽ tạo liên kết chết.
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

      <div className={styles.categoryGrid}>
        {copy.categories.map((entry) => (
          <Link key={entry.href} href={localizedHref(locale, entry.href)} className={styles.categoryTile}>
            <span className={styles.categoryName}>{entry.name}</span>
            <span className={styles.categoryHint}>{entry.hint}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
