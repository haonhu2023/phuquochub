import styles from './legal.module.css';
import { DEFAULT_LOCALE, type Locale } from '@/lib/locale';

export const BETA_DISCLOSURE_TEXT: Record<Locale, string> = {
  vi: 'PhuQuocHub đang trong giai đoạn Public Beta. Một số thông tin địa điểm đang được xác minh và hoàn thiện.',
  en: 'PhuQuocHub is in Public Beta. Some place information is still being verified and completed.',
};

// Thông báo Public Beta sitewide — CHỈ thuộc layout công khai (xem app/[locale]/(public)/layout.tsx).
// Không dismiss/localStorage: đây là trạng thái CỦA CẢ SITE trong giai đoạn này, không phải một
// thông báo tạm thời người dùng có thể bỏ qua vĩnh viễn. Không đưa vào structured data (JSON-LD
// mô tả THỰC THỂ địa điểm/website, không phải trạng thái vận hành tạm thời của sản phẩm).
//
// `locale` (SEO v2): tuỳ chọn, mặc định `DEFAULT_LOCALE` — trước đây banner LUÔN tiếng Việt kể cả
// trên `/en`, vi phạm chính yêu cầu "no Vietnamese under /en" áp dụng cho mọi phần tử sitewide.
export function BetaBanner({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  return (
    <div className={styles.betaBanner}>
      <p className={styles.betaBannerText}>{BETA_DISCLOSURE_TEXT[locale]}</p>
    </div>
  );
}
