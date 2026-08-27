import styles from './legal.module.css';

export const BETA_DISCLOSURE_TEXT =
  'PhuQuocHub đang trong giai đoạn Public Beta. Một số thông tin địa điểm đang được xác minh và hoàn thiện.';

// Thông báo Public Beta sitewide — CHỈ thuộc layout công khai (xem app/(public)/layout.tsx).
// Không dismiss/localStorage: đây là trạng thái CỦA CẢ SITE trong giai đoạn này, không phải một
// thông báo tạm thời người dùng có thể bỏ qua vĩnh viễn. Không đưa vào structured data (JSON-LD
// mô tả THỰC THỂ địa điểm/website, không phải trạng thái vận hành tạm thời của sản phẩm).
export function BetaBanner() {
  return (
    <div className={styles.betaBanner}>
      <p className={styles.betaBannerText}>{BETA_DISCLOSURE_TEXT}</p>
    </div>
  );
}
