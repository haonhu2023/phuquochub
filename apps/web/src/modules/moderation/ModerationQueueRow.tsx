import Link from 'next/link';
import styles from './moderation.module.css';
import { CaseStatusBadge, SeverityBadge } from './badges';
import { SOURCE_LABELS, TARGET_TYPE_LABELS, labelOf } from './labels';
import type { ModerationCaseSummary } from './types';

// Hàng hàng-chờ (presentational). CHỈ metadata hữu ích cho hàng chờ — KHÔNG lộ dữ liệu riêng tư
// người báo cáo (summary của M2 không chứa reporter). Chỉ hiện TRẠNG THÁI nhận việc, không hiện
// UUID người xử lý.
export function ModerationQueueRow({ c }: { c: ModerationCaseSummary }) {
  return (
    <Link href={`/dashboard/moderation/${c.id}`} className={styles.row}>
      <div className={styles.rowTop}>
        <span className={styles.rowTitle}>{labelOf(TARGET_TYPE_LABELS, c.target_type)}</span>
        <div className={styles.rowBadges}>
          <CaseStatusBadge status={c.status} />
          <SeverityBadge severity={c.severity} />
        </div>
      </div>
      <div className={styles.rowMeta}>
        <span className={styles.metaItem}>Nguồn: {labelOf(SOURCE_LABELS, c.source)}</span>
        <span className={styles.metaItem}>
          Ưu tiên: <span className={styles.metaStrong}>{c.priority}</span>
        </span>
        <span className={styles.metaItem}>
          Báo cáo: <span className={styles.metaStrong}>{c.report_count}</span>
        </span>
        <span className={styles.metaItem}>{c.assigned_to ? 'Đã có người xử lý' : 'Chưa ai nhận'}</span>
        <span className={styles.metaItem}>{formatDateTime(c.created_at)}</span>
      </div>
    </Link>
  );
}

// ISO -> chuỗi ngày giờ dễ đọc; nếu parse lỗi thì trả nguyên chuỗi (không ném, không "Invalid Date").
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
