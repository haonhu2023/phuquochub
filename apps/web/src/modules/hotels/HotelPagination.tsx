import Link from 'next/link';
import { buildPageList } from './pagination';
import styles from './hotels.module.css';

interface Props {
  page: number;
  totalPages: number;
  /** Query string hiện tại TRỪ `page` (vd "stars=4&sort=name_asc") — giữ nguyên bộ lọc khi đổi trang. */
  baseQuery: string;
}

function hrefFor(page: number, baseQuery: string): string {
  const params = new URLSearchParams(baseQuery);
  params.set('page', String(page));
  return `/hotels?${params.toString()}`;
}

// Server Component thuần (link-based) — điều hướng phân trang hoạt động cả khi JS chưa chạy.
export function HotelPagination({ page, totalPages, baseQuery }: Props) {
  if (totalPages <= 1) return null;

  const pages = buildPageList(page, totalPages);

  return (
    <nav className={styles.pagination} aria-label="Phân trang">
      {page > 1 ? (
        <Link className={styles.pageLink} href={hrefFor(page - 1, baseQuery)} rel="prev">
          ‹ Trước
        </Link>
      ) : (
        <span className={styles.pageDisabled} aria-disabled="true">
          ‹ Trước
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
          <Link key={p} className={styles.pageLink} href={hrefFor(p, baseQuery)}>
            {p}
          </Link>
        ),
      )}

      {page < totalPages ? (
        <Link className={styles.pageLink} href={hrefFor(page + 1, baseQuery)} rel="next">
          Sau ›
        </Link>
      ) : (
        <span className={styles.pageDisabled} aria-disabled="true">
          Sau ›
        </span>
      )}
    </nav>
  );
}
