import Link from 'next/link';
import styles from './legal.module.css';

// Footer chung: đường dẫn tới các trang tin cậy/pháp lý. Đặt ở layout công khai VÀ layout đăng
// nhập/đăng ký, vì trang đăng ký là nơi người dùng lần đầu cung cấp dữ liệu cá nhân — họ phải với
// tới được Điều khoản và Chính sách bảo mật ngay tại đó, không chỉ ở khu vực công khai.
export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <nav className={styles.footerNav} aria-label="Liên kết pháp lý và thông tin">
          <Link href="/about">Giới thiệu</Link>
          <Link href="/contact">Liên hệ</Link>
          <Link href="/privacy">Chính sách bảo mật</Link>
          <Link href="/terms">Điều khoản sử dụng</Link>
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
