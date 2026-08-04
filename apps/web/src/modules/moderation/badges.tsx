import styles from './moderation.module.css';
import { CASE_STATUS_LABELS, SEVERITY_LABELS, labelOf } from './labels';

// Badge LUÔN kèm nhãn chữ — màu chỉ là tín hiệu phụ (a11y: không truyền trạng thái chỉ bằng màu).

const STATUS_TONE: Record<string, string> = {
  open: styles.stOpen,
  claimed: styles.stClaimed,
  resolved: styles.stResolved,
  dismissed: styles.stDismissed,
};

const SEVERITY_TONE: Record<string, string> = {
  low: styles.sevLow,
  normal: styles.sevNormal,
  high: styles.sevHigh,
  critical: styles.sevCritical,
};

export function CaseStatusBadge({ status }: { status: string }) {
  return (
    <span className={`${styles.badge} ${STATUS_TONE[status] ?? ''}`}>
      {labelOf(CASE_STATUS_LABELS, status)}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`${styles.badge} ${SEVERITY_TONE[severity] ?? ''}`}>
      Mức {labelOf(SEVERITY_LABELS, severity)}
    </span>
  );
}
