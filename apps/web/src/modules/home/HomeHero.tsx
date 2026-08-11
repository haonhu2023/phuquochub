import { SearchBox } from '@/modules/search/SearchBox';
import styles from './home.module.css';

export const HOME_TITLE = 'Khám phá Phú Quốc';
export const HOME_DESCRIPTION =
  'Tìm địa điểm, khách sạn, nhà hàng, tour và trải nghiệm tại Phú Quốc.';

/**
 * Hero trang chủ — Server Component thuần, KHÔNG JavaScript phía client.
 *
 * Ô tìm kiếm tái dùng NGUYÊN VẸN `SearchBox` của module search (form GET → /search): không có
 * triển khai tìm kiếm thứ hai nào ở đây, và vì là form GET thật nên nó hoạt động cả khi JS chưa
 * tải xong. `q=""` vì trang chủ luôn bắt đầu từ trạng thái rỗng; không truyền category/ward/
 * price_range để người dùng vào /search không bị áp sẵn bộ lọc nào.
 */
export function HomeHero() {
  return (
    <section className={styles.hero} aria-labelledby="home-hero-title">
      <h1 id="home-hero-title" className={styles.heroTitle}>
        {HOME_TITLE}
      </h1>
      <p className={styles.heroLede}>{HOME_DESCRIPTION}</p>
      <div className={styles.heroSearch}>
        <SearchBox q="" />
      </div>
    </section>
  );
}
