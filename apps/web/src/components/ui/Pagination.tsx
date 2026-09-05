import Link from 'next/link';
import { buildPageList } from '@/lib/pagination';
import type { Locale } from '@/lib/locale';
import styles from './ui.module.css';

interface Props {
  page: number;
  totalPages: number;
  /** Route gốc, vd "/hotels" hoặc "/restaurants". */
  basePath: string;
  /** Query string hiện tại TRỪ `page` (vd "stars=4&sort=name_asc") — giữ nguyên bộ lọc khi đổi trang. */
  baseQuery: string;
  /** Mặc định 'vi': các nơi gọi nội bộ/dashboard (chưa có `[locale]` segment) không cần đổi. */
  locale?: Locale;
}

const LABELS: Record<Locale, { prev: string; next: string; nav: string }> = {
  vi: { prev: '‹ Trước', next: 'Sau ›', nav: 'Phân trang' },
  en: { prev: '‹ Prev', next: 'Next ›', nav: 'Pagination' },
};

function hrefFor(basePath: string, page: number, baseQuery: string): string {
  const params = new URLSearchParams(baseQuery);
  params.set('page', String(page));
  return `${basePath}?${params.toString()}`;
}

// Server Component thuần (link-based) — điều hướng phân trang hoạt động cả khi JS chưa chạy.
// Dùng chung cho mọi trang browse (hotels/restaurants/tours…) LẪN các trang dashboard/nội bộ
// (chưa có `[locale]`, luôn `vi` — không đổi hành vi các nơi gọi đó).
export function Pagination({ page, totalPages, basePath, baseQuery, locale = 'vi' }: Props) {
  if (totalPages <= 1) return null;

  const pages = buildPageList(page, totalPages);
  const t = LABELS[locale];

  return (
    <nav className={styles.pagination} aria-label={t.nav}>
      {page > 1 ? (
        <Link className={styles.pageLink} href={hrefFor(basePath, page - 1, baseQuery)} rel="prev">
          {t.prev}
        </Link>
      ) : (
        <span className={styles.pageDisabled} aria-disabled="true">
          {t.prev}
        </span>
      )}

      {pages.map((p, i) =>
        p === 'ellipsis' ? (
          <span key={`e${i}`} className={styles.pageEllipsis}>
            …
          </span>
        ) : p === page ? (
          <span key={p} className={styles.pageLinkCurrent} aria-current="page">
            {p}
          </span>
        ) : (
          <Link key={p} className={styles.pageLink} href={hrefFor(basePath, p, baseQuery)}>
            {p}
          </Link>
        ),
      )}

      {page < totalPages ? (
        <Link className={styles.pageLink} href={hrefFor(basePath, page + 1, baseQuery)} rel="next">
          {t.next}
        </Link>
      ) : (
        <span className={styles.pageDisabled} aria-disabled="true">
          {t.next}
        </span>
      )}
    </nav>
  );
}
