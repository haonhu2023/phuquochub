import Link from 'next/link';
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
 * Danh sách này PHẢI khớp với route thật; thêm mục ở đây mà không có trang tương ứng sẽ tạo liên
 * kết chết.
 */
const ENTRIES: Array<{ href: string; name: string; hint: string }> = [
  { href: '/hotels', name: 'Khách sạn', hint: 'Nơi lưu trú' },
  { href: '/restaurants', name: 'Nhà hàng', hint: 'Ăn uống' },
  { href: '/tours', name: 'Tour', hint: 'Trải nghiệm có hướng dẫn' },
  { href: '/attractions', name: 'Điểm tham quan', hint: 'Nơi nên ghé' },
  { href: '/beaches', name: 'Bãi biển', hint: 'Biển và bờ cát' },
  { href: '/events', name: 'Sự kiện', hint: 'Đang và sắp diễn ra' },
];

export function CategoryLinks() {
  return (
    <section className={styles.section} aria-labelledby="home-categories-title">
      <div className={styles.sectionHead}>
        <h2 id="home-categories-title" className={styles.sectionTitle}>
          Bạn đang tìm gì?
        </h2>
        <Link href="/places" className={styles.sectionLink}>
          Tất cả địa điểm →
        </Link>
      </div>

      <div className={styles.categoryGrid}>
        {ENTRIES.map((entry) => (
          <Link key={entry.href} href={entry.href} className={styles.categoryTile}>
            <span className={styles.categoryName}>{entry.name}</span>
            <span className={styles.categoryHint}>{entry.hint}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
