import Link from 'next/link';
import styles from '@/modules/shell/shell.module.css';
import { getNavCopy } from '@/modules/shell/nav.copy';
import { DEFAULT_LOCALE, localizedHref, type Locale } from '@/lib/locale';
import type { SocialLinksValue } from '@/modules/site-content/types';

interface Props {
  /**
   * PR A: tuỳ chọn, mặc định `DEFAULT_LOCALE`. `SiteFooter` được dùng ở CẢ layout công khai (có
   * `params.locale` thật) LẪN layout đăng nhập/đăng ký (`(auth)`, không có locale prefix, không
   * có locale nào để truyền) — mặc định đảm bảo footer vẫn render đúng khi gọi từ nơi không có
   * locale context, thay vì bắt buộc mọi nơi gọi phải tự biết truyền gì.
   */
  locale?: Locale;
  /**
   * S1 (2026-09-22) — tuỳ chọn, mặc định KHÔNG truyền (ẩn cả nhóm). `SiteFooter` vẫn là component
   * ĐỒNG BỘ THUẦN (không tự fetch) — `legal.spec.tsx` render nó bằng `render(<SiteFooter />)`
   * trong jsdom, không `await` được một Server Component bất đồng bộ. Layout công khai (async) tự
   * gọi `getHomeContent()` rồi truyền prop này xuống; layout đăng nhập/đăng ký không truyền → giữ
   * nguyên hành vi cũ (không có nhóm "Kết nối" nào ở đó).
   */
  socialLinks?: SocialLinksValue;
}

const SOCIAL_LABELS: Record<keyof SocialLinksValue, string> = {
  facebook: 'Facebook',
  zalo: 'Zalo',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  phone: 'Điện thoại',
};

function socialHref(key: keyof SocialLinksValue, value: string): string {
  return key === 'phone' ? `tel:${value}` : value;
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
export function SiteFooter({ locale = DEFAULT_LOCALE, socialLinks }: Props) {
  const nav = getNavCopy(locale);
  // Tra bằng toán tử ba ngôi, KHÔNG index thẳng vào Record — cùng cách getNavCopy()/getHomeCopy()
  // đã tự vệ. Phát hiện qua chạy trình duyệt thật (S1, 2026-09-22): `/favicon.ico` (chưa có file
  // tĩnh nào) rơi qua route `[locale]` với `locale="favicon.ico"` — index Record thẳng trả về
  // `undefined`, làm `legal.about` NÉM LỖI, sập SSR của chính request đó. Lỗi CÓ TRƯỚC S1 (không
  // phải do CMS gây ra) — chỉ mới bị phát hiện vì đây là lần đầu chạy trình duyệt thật kèm đọc kỹ
  // log server sau khi sửa file này.
  const legal = locale === 'en' ? ABOUT_LINKS.en : ABOUT_LINKS.vi;
  const socialEntries = socialLinks
    ? (Object.entries(socialLinks) as Array<[keyof SocialLinksValue, string | null]>).filter(
        (entry): entry is [keyof SocialLinksValue, string] => Boolean(entry[1]),
      )
    : [];

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

        {socialEntries.length > 0 && (
          <div>
            <p className={styles.footerGroupTitle}>{locale === 'en' ? 'Connect' : 'Kết nối'}</p>
            <nav className={styles.footerGroupLinks} aria-label={locale === 'en' ? 'Connect' : 'Kết nối'}>
              {socialEntries.map(([key, value]) => (
                <a key={key} href={socialHref(key, value)} rel="noreferrer noopener" target={key === 'phone' ? undefined : '_blank'}>
                  {SOCIAL_LABELS[key]}
                </a>
              ))}
            </nav>
          </div>
        )}
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
