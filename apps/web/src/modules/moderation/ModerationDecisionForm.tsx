'use client';

import { useState, type FormEvent } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { decideModerationCase } from './api/moderation.api';
import { allowedDecisions, MEDIA_RESTORE_TARGETS, type ContentDecision } from './decisions';
import type { DecideModerationCaseRequest, MediaStatus, ModerationCaseDetail } from './types';
import styles from './moderation.module.css';

interface Props {
  detail: ModerationCaseDetail;
  /** Gọi sau khi backend xác nhận thành công — cha nạp lại case (KHÔNG optimistic). */
  onDecided: () => void;
}

// Form quyết định: chỉ render quyết định HỢP LỆ (allowedDecisions). reason bắt buộc cho reject|hide;
// target_status bắt buộc cho restore media. Client validate để UX tốt; backend vẫn quyết định. Không
// mutate trạng thái lạc quan — chỉ phản ánh sau khi server xác nhận (onDecided → refetch).
export function ModerationDecisionForm({ detail, onDecided }: Props) {
  const options = allowedDecisions(detail.target_preview, detail.status);
  const [selected, setSelected] = useState<ContentDecision | null>(null);
  const [reason, setReason] = useState('');
  const [mediaTarget, setMediaTarget] = useState<MediaStatus>('published');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (detail.status === 'resolved' || detail.status === 'dismissed') {
    return <p className={styles.previewEmpty}>Case đã được xử lý — không còn hành động nào.</p>;
  }
  if (options.length === 0) {
    return (
      <p className={styles.previewEmpty}>
        Hiện không có hành động hợp lệ cho nội dung này (nội dung có thể đã bị xoá hoặc ở trạng thái
        không cho phép thao tác).
      </p>
    );
  }

  const current = options.find((o) => o.decision === selected) ?? null;
  const reasonMissing = !!current?.requiresReason && !reason.trim();
  const submitDisabled = !current || submitting || reasonMissing;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!current || submitting) return;
    setError(null);
    if (current.requiresReason && !reason.trim()) {
      setError('Vui lòng nhập lý do cho quyết định này.');
      return;
    }
    const session = readSession();
    if (!session) {
      setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    const body: DecideModerationCaseRequest = { decision: current.decision };
    if (current.requiresReason) body.reason = reason.trim();
    if (current.requiresMediaTargetStatus) body.target_status = mediaTarget;

    setSubmitting(true);
    try {
      await decideModerationCase(detail.id, body, session.accessToken);
      setSuccess(true);
      onDecided(); // refetch: trạng thái phản ánh state đã commit ở server
    } catch (err) {
      setError(decideErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.decision} onSubmit={onSubmit} aria-busy={submitting}>
      {error && (
        <p className={styles.alert} role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className={styles.success} role="status">
          Đã áp dụng quyết định. Đang cập nhật trạng thái…
        </p>
      )}

      <fieldset className={styles.decisionOptions}>
        <legend className={styles.decisionLegend}>Chọn quyết định</legend>
        {options.map((o) => (
          <label
            key={o.decision}
            className={`${styles.decisionOption} ${o.tone === 'approve' ? styles.optApprove : styles.optRemove}`}
          >
            <input
              type="radio"
              name="decision"
              value={o.decision}
              checked={selected === o.decision}
              onChange={() => {
                setSelected(o.decision);
                setError(null);
                setSuccess(false);
              }}
            />
            {o.label}
          </label>
        ))}
      </fieldset>

      {current?.requiresReason && (
        <div className={styles.fieldBlock}>
          <label htmlFor="mod-reason">Lý do (bắt buộc)</label>
          <textarea
            id="mod-reason"
            className={styles.reason}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            aria-required="true"
            maxLength={2000}
          />
        </div>
      )}

      {current?.requiresMediaTargetStatus && (
        <div className={styles.fieldBlock}>
          <label htmlFor="mod-restore-target">Khôi phục về</label>
          <select
            id="mod-restore-target"
            className={styles.reason}
            value={mediaTarget}
            onChange={(e) => setMediaTarget(e.target.value as MediaStatus)}
          >
            {MEDIA_RESTORE_TARGETS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={styles.actions}>
        <button type="submit" className={styles.submitBtn} disabled={submitDisabled}>
          {submitting ? 'Đang gửi…' : current ? `Áp dụng: ${current.label}` : 'Chọn một quyết định'}
        </button>
      </div>
    </form>
  );
}

// Thông điệp an toàn cho người dùng (không lộ lỗi kỹ thuật). 4xx của BE là tiếng Việt an toàn;
// 5xx/mạng -> thông báo chung. 409 = case đã bị xử lý bởi người khác (stale).
export function decideErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) {
      return 'Case đã được người khác xử lý trong lúc bạn thao tác. Vui lòng tải lại để xem trạng thái mới nhất.';
    }
    if (err.status === 403) return 'Bạn không có quyền thực hiện quyết định này.';
    if (err.status === 404) return 'Case không còn tồn tại.';
    if (err.status < 500) return err.message; // 422… — thông điệp BE an toàn
  }
  return 'Không thực hiện được quyết định. Vui lòng thử lại.';
}
