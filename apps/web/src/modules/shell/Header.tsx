import Link from 'next/link';
import { localizedHref, type Locale } from '@/lib/locale';
import { getNavCopy } from './nav.copy';
import { LanguageSwitch } from './LanguageSwitch';
import styles from './shell.module.css';

/**
 * Header công khai V2 (Phase 4) — thay `<header style={{...inline...}}>` cũ (5 liên kết tiếng Việt
 * cứng bất kể locale, không có menu di động, không có công tắc ngôn ngữ nhìn thấy được).
 *
 * Server Component thuần NGOẠI TRỪ `LanguageSwitch` (đảo client nhỏ, cần `usePathname()`). Menu di
 * động dùng `<details>/<summary>` gốc HTML — KHÔNG state React, KHÔNG thư viện ngoài: hoạt động cả
 * khi JS chưa chạy, tự có hành vi bàn phím ĐÚNG chuẩn (Enter/Space mở, Esc đóng theo trình duyệt),
 * và không kéo thêm phụ thuộc nào chỉ để làm menu di động (đúng yêu cầu Phase 4).
 */
export function Header({ locale }: { locale: Locale }) {
  const copy = getNavCopy(locale);

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href={localizedHref(locale, '/')} className={styles.wordmark}>
          PhuQuocHub
        </Link>

        <nav className={styles.desktopNav} aria-label={locale === 'en' ? 'Main navigation' : 'Điều hướng chính'}>
          {copy.headerItems.map((item) => (
            <Link key={item.href} href={localizedHref(locale, item.href)} className={styles.navLink}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={styles.headerActions}>
          <Link href={localizedHref(locale, '/search')} className={styles.searchLink}>
            {copy.searchLabel}
          </Link>
          <span className={styles.desktopOnly}>
            <LanguageSwitch locale={locale} />
          </span>

          {/* Menu di động: <details> gốc HTML, không JavaScript. */}
          <details className={styles.mobileMenu}>
            <summary className={styles.mobileMenuButton} aria-label={copy.menuOpenLabel}>
              <span aria-hidden="true" className={styles.hamburgerIcon}>
                <span />
                <span />
                <span />
              </span>
            </summary>
            <nav
              className={styles.mobileNavPanel}
              aria-label={locale === 'en' ? 'Main navigation' : 'Điều hướng chính'}
            >
              {copy.headerItems.map((item) => (
                <Link key={item.href} href={localizedHref(locale, item.href)} className={styles.mobileNavLink}>
                  {item.label}
                </Link>
              ))}
              <div className={styles.mobileLangRow}>
                <LanguageSwitch locale={locale} />
              </div>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
