import Link from 'next/link';
import { SearchBox } from '@/modules/search/SearchBox';
import { listPlaces } from '@/modules/places/api/places.api';
import { DEFAULT_LOCALE, localizedHref, type Locale } from '@/lib/locale';
import { getHomeCopy } from './home.copy';
import { HeroVisual, type HeroVisualPlace } from './HeroVisual';
import styles from './home.module.css';

/** Một fetch nhỏ, có chặn trên, tự nuốt lỗi — một API hỏng không được làm mất cả khối hero, chỉ
 * làm compositon bên phải rơi về bố cục trang trí thuần không có tên thật. */
async function fetchHeroPlaces(): Promise<HeroVisualPlace[]> {
  try {
    const places = await listPlaces({ limit: 4 });
    return places.slice(0, 3).map((p) => ({ id: p.id, name: p.name }));
  } catch {
    return [];
  }
}

/**
 * Hero trang chủ V3 (Phase 3) — bố cục hai cột trên desktop: TRÁI giữ nguyên nội dung chức năng
 * (eyebrow → H1 → lede → tìm kiếm → lối tắt → tín hiệu tin cậy, tất cả vẫn Server Component thuần,
 * KHÔNG JavaScript phía client). PHẢI giờ có thêm một composition thị giác bên PHẢI
 * (`HeroVisual`) — đây là thay đổi bắt buộc so với V1/V2 (chỉ có cột trái) để trang chủ "đáng nhớ
 * ngay cả khi không có ảnh chụp nào" thay vì chỉ là văn bản + form.
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
export async function HomeHero({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const copy = getHomeCopy(locale);
  const heroPlaces = await fetchHeroPlaces();
  return (
    <section className={styles.hero} aria-labelledby="home-hero-title">
      <div className={styles.heroGrid}>
        <div className={styles.heroContent}>
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
        </div>

        <HeroVisual locale={locale} places={heroPlaces} />
      </div>
    </section>
  );
}
