import { DEFAULT_LOCALE, localizedHref, type Locale } from '@/lib/locale';
import styles from './search.module.css';

interface Props {
  q: string;
  category?: string;
  ward?: string;
  price_range?: string;
  locale?: Locale;
  /** Ghi đè placeholder mặc định — dùng ở trang chủ để khớp giọng điệu hero (`home.copy.ts`). */
  placeholder?: string;
  /** Ghi đè nhãn trợ năng mặc định — PHẢI đổi cùng lúc với `placeholder` khi gọi từ locale khác. */
  ariaLabel?: string;
  /** Ghi đè nhãn nút gửi mặc định. */
  submitLabel?: string;
}

// Server Component thuần (GET form) — hoạt động cả khi JS chưa chạy, cùng triết lý với
// Pagination (link-based). Submit điều hướng /{locale}/search?q=...&category=...&ward=...&
// price_range=... — giữ nguyên bộ lọc hiện tại qua hidden input, KHÔNG giữ `page` (đổi q luôn
// reset về trang 1, cùng quy ước SearchFilters.updateParam xoá `page` khi đổi bộ lọc).
//
// PR A: `action` trỏ thẳng `/{locale}/search` thay vì `/search` — form GET native (không phải
// SPA `<Link>`) nên middleware VẪN sẽ redirect đúng nếu thiếu prefix, nhưng trỏ thẳng tránh một
// vòng redirect thừa (giữ đúng yêu cầu "không làm mất locale khi điều hướng").
//
// `placeholder`/`ariaLabel`/`submitLabel` (map/home upgrade): mặc định GIỮ NGUYÊN tiếng Việt hiện
// có — trang /search tự nó gọi component này chưa truyền các prop mới, nên hành vi không đổi ở
// đó. Trang chủ truyền bản dịch từ `home.copy.ts` để form khớp locale hero đang hiển thị.
export function SearchBox({
  q,
  category,
  ward,
  price_range,
  locale = DEFAULT_LOCALE,
  placeholder = 'vd: bai sao, dinh cau…',
  ariaLabel = 'Từ khoá tìm kiếm',
  submitLabel = 'Tìm',
}: Props) {
  return (
    <form method="get" action={localizedHref(locale, '/search')} className={styles.searchBox}>
      <input
        type="text"
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={styles.searchInput}
      />
      {category && <input type="hidden" name="category" value={category} />}
      {ward && <input type="hidden" name="ward" value={ward} />}
      {price_range && <input type="hidden" name="price_range" value={price_range} />}
      <button type="submit" className={styles.searchButton}>
        {submitLabel}
      </button>
    </form>
  );
}
