import Link from 'next/link';
import styles from './legal.module.css';
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

// Footer chung: đường dẫn tới các trang tin cậy/pháp lý. Đặt ở layout công khai VÀ layout đăng
// nhập/đăng ký, vì trang đăng ký là nơi người dùng lần đầu cung cấp dữ liệu cá nhân — họ phải với
// tới được Điều khoản và Chính sách bảo mật ngay tại đó, không chỉ ở khu vực công khai.
export function SiteFooter({ locale = DEFAULT_LOCALE }: Props) {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <nav className={styles.footerNav} aria-label="Liên kết pháp lý và thông tin">
          <Link href={localizedHref(locale, '/about')}>Giới thiệu</Link>
          <Link href={localizedHref(locale, '/contact')}>Liên hệ</Link>
          <Link href={localizedHref(locale, '/privacy')}>Chính sách bảo mật</Link>
          <Link href={localizedHref(locale, '/terms')}>Điều khoản sử dụng</Link>
        </nav>
        <p className={styles.footerNote}>
          PhuQuocHub — dữ liệu bản đồ ©{' '}
          <a href="https://www.openstreetmap.org/copyright" rel="noreferrer noopener" target="_blank">
            OpenStreetMap
          </a>{' '}
          contributors
        </p>
      </div>
    </footer>
  );
}
