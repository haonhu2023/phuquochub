import { DEFAULT_LOCALE, localizedHref, type Locale } from '@/lib/locale';
import styles from './search.module.css';

interface Props {
  q: string;
  category?: string;
  ward?: string;
  price_range?: string;
  locale?: Locale;
}

// Server Component thuần (GET form) — hoạt động cả khi JS chưa chạy, cùng triết lý với
// Pagination (link-based). Submit điều hướng /{locale}/search?q=...&category=...&ward=...&
// price_range=... — giữ nguyên bộ lọc hiện tại qua hidden input, KHÔNG giữ `page` (đổi q luôn
// reset về trang 1, cùng quy ước SearchFilters.updateParam xoá `page` khi đổi bộ lọc).
//
// PR A: `action` trỏ thẳng `/{locale}/search` thay vì `/search` — form GET native (không phải
// SPA `<Link>`) nên middleware VẪN sẽ redirect đúng nếu thiếu prefix, nhưng trỏ thẳng tránh một
// vòng redirect thừa (giữ đúng yêu cầu "không làm mất locale khi điều hướng").
export function SearchBox({ q, category, ward, price_range, locale = DEFAULT_LOCALE }: Props) {
  return (
    <form method="get" action={localizedHref(locale, '/search')} className={styles.searchBox}>
      <input
        type="text"
        name="q"
        defaultValue={q}
        placeholder="vd: bai sao, dinh cau…"
        aria-label="Từ khoá tìm kiếm"
        className={styles.searchInput}
      />
      {category && <input type="hidden" name="category" value={category} />}
      {ward && <input type="hidden" name="ward" value={ward} />}
      {price_range && <input type="hidden" name="price_range" value={price_range} />}
      <button type="submit" className={styles.searchButton}>
        Tìm
      </button>
    </form>
  );
}
