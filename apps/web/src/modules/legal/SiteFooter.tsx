import Link from 'next/link';
import styles from '@/modules/shell/shell.module.css';
import { getNavCopy } from '@/modules/shell/nav.copy';
import { DEFAULT_LOCALE, localizedHref, type Locale } from '@/lib/locale';

interface Props {
  /**
   * PR A: tuỳ chọn, mặc định `DEFAULT_LOCALE`. `SiteFooter` được dùng ở CẢ layout công khai (có
   * `params.locale` thật) LẪN layout đăng nhập/đăng ký (`(auth)`, không có locale prefix, không
   * có locale nào để truyền) — mặc định đảm bảo footer vẫn render đúng khi gọi từ nơi không có
   * locale context, thay vì bắt buộc mọi nơi gọi phải tự biết truyền gì.
   */
  locale?: Locale;
}

const ABOUT_LINKS: Record<Locale, { about: string; contact: string; privacy: string; terms: string }> = {
  vi: { about: 'Giới thiệu', contact: 'Liên hệ', privacy: 'Chính sách bảo mật', terms: 'Điều khoản sử dụng' },
  en: { about: 'About', contact: 'Contact', privacy: 'Privacy Policy', terms: 'Terms of Service' },
};

/**
 * Footer V2 (Phase 15) — nâng từ một dải liên kết pháp lý đơn giản thành footer điều hướng/SEO
 * thật: nhóm "Khám phá" (internal linking thật tới các trang duyệt), nhóm "PhuQuocHub" (pháp lý),
 * và công tắc ngôn ngữ hiển thị TƯỜNG MINH (không chỉ ở header — hữu ích khi người dùng cuộn hết
 * trang). Mọi liên kết đều là route CÓ THẬT — không có mục nào trỏ tới trang chưa tồn tại.
 */
export function SiteFooter({ locale = DEFAULT_LOCALE }: Props) {
  const nav = getNavCopy(locale);
  const legal = ABOUT_LINKS[locale];

  return (
    <footer className={styles.footerV2}>
      <div className={styles.footerV2Inner}>
        <div>
          <p className={styles.footerGroupTitle}>{nav.footerExploreTitle}</p>
          <nav className={styles.footerGroupLinks} aria-label={nav.footerExploreTitle}>
            {nav.footerExploreItems.map((item) => (
              <Link key={item.href} href={localizedHref(locale, item.href)}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div>
          <p className={styles.footerGroupTitle}>{nav.footerAboutTitle}</p>
          <nav className={styles.footerGroupLinks} aria-label={nav.footerAboutTitle}>
            <Link href={localizedHref(locale, '/about')}>{legal.about}</Link>
            <Link href={localizedHref(locale, '/contact')}>{legal.contact}</Link>
            <Link href={localizedHref(locale, '/privacy')}>{legal.privacy}</Link>
            <Link href={localizedHref(locale, '/terms')}>{legal.terms}</Link>
          </nav>
        </div>

        <div>
          <p className={styles.footerGroupTitle}>{nav.footerLanguageTitle}</p>
          <nav className={styles.footerGroupLinks} aria-label={nav.footerLanguageTitle}>
            <Link href={localizedHref('vi', '/')} lang="vi" hrefLang="vi">
              Tiếng Việt
            </Link>
            <Link href={localizedHref('en', '/')} lang="en" hrefLang="en">
              English
            </Link>
          </nav>
        </div>
      </div>

      <p className={styles.footerBottom}>
        PhuQuocHub —{' '}
        {locale === 'en' ? 'map data ©' : 'dữ liệu bản đồ ©'}{' '}
        <a href="https://www.openstreetmap.org/copyright" rel="noreferrer noopener" target="_blank">
          OpenStreetMap
        </a>{' '}
        contributors
      </p>
    </footer>
  );
}
