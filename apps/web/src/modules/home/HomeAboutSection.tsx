import { getHomeContent } from '@/modules/site-content/api/site-content.api';
import type { Locale } from '@/lib/locale';
import styles from './home.module.css';

/**
 * S1 (2026-09-22) — khối "Giới thiệu" owner tự viết qua CMS (`site_content.home_about`). KHÔNG
 * tồn tại trước tính năng này — hoàn toàn phụ trợ: không có hàng nào cho key này thì khối này
 * không render gì cả (không giữ chỗ rỗng, không fallback text tĩnh), khác `TrustSection`/`HomeHero`
 * vốn luôn có nội dung mặc định từ `home.copy.ts`. Lỗi tải cũng render null — một API hỏng không
 * được phép làm hỏng cả trang chủ vì một khối hoàn toàn tuỳ chọn.
 */
export async function HomeAboutSection({ locale }: { locale: Locale }) {
  const about = await getHomeContent(locale)
    .then((c) => c.about)
    .catch(() => null);
  if (!about) return null;

  return (
    <section className={styles.section} aria-labelledby="home-about-title">
      <div className={styles.sectionHead}>
        <h2 id="home-about-title" className={styles.sectionTitle}>
          {about.title}
        </h2>
      </div>
      <p>{about.body}</p>
    </section>
  );
}
