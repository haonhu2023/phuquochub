import Link from 'next/link';
import { SearchBox } from '@/modules/search/SearchBox';
import { DEFAULT_LOCALE, localizedHref, type Locale } from '@/lib/locale';
import { getHomeCopy } from './home.copy';
import styles from './home.module.css';

/**
 * Hero trang chủ — Server Component thuần, KHÔNG JavaScript phía client.
 *
 * Phân cấp thông tin (map/home upgrade): eyebrow định vị sản phẩm → H1 → lời hứa giá trị ngắn →
 * ô tìm kiếm thật → lối tắt theo nhu cầu phổ biến → một câu tín hiệu tin cậy. Mọi văn bản đến từ
 * `home.copy.ts` — không còn tiếng Việt cứng bất kể `/en` hay `/vi`.
 *
 * Ô tìm kiếm tái dùng NGUYÊN VẸN `SearchBox` của module search (form GET → /search): không có
 * triển khai tìm kiếm thứ hai nào ở đây, và vì là form GET thật nên nó hoạt động cả khi JS chưa
 * tải xong. `q=""` vì trang chủ luôn bắt đầu từ trạng thái rỗng; không truyền category/ward/
 * price_range để người dùng vào /search không bị áp sẵn bộ lọc nào.
 *
 * Lối tắt theo nhu cầu (`intentShortcuts`) trỏ tới các trang duyệt CÓ THẬT (không phải nút chết) —
 * cùng route thật mà `CategoryLinks` dùng, chỉ khác cách trình bày (chip ngang trong hero thay vì
 * lưới ô vuông bên dưới).
 */
export function HomeHero({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const copy = getHomeCopy(locale);
  return (
    <section className={styles.hero} aria-labelledby="home-hero-title">
      <p className={styles.heroEyebrow}>{copy.eyebrow}</p>
      <h1 id="home-hero-title" className={styles.heroTitle}>
        {copy.title}
      </h1>
      <p className={styles.heroLede}>{copy.lede}</p>
      <div className={styles.heroSearch}>
        <SearchBox
          q=""
          locale={locale}
          placeholder={copy.searchPlaceholder}
          ariaLabel={copy.searchAriaLabel}
          submitLabel={copy.searchButton}
        />
      </div>
      <div className={styles.heroIntents}>
        <span className={styles.heroIntentsLabel}>{copy.intentLabel}</span>
        {copy.intentShortcuts.map((shortcut) => (
          <Link key={shortcut.href} href={localizedHref(locale, shortcut.href)} className={styles.heroChip}>
            {shortcut.label}
          </Link>
        ))}
      </div>
      <p className={styles.heroTrust}>{copy.trustSignal}</p>
    </section>
  );
}
