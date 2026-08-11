'use client';

import { useState, type FormEvent } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';
import { decideBusinessClaim } from './api/business-claims.api';
import { CLAIM_REASON_CODE_LABELS } from './claimStatusLabels';
import type {
  BusinessClaimDecisionValue,
  BusinessClaimReasonCodeValue,
  DecideBusinessClaimRequest,
  ModeratorBusinessClaimDetail,
} from './types';
import styles from './business-claims.module.css';

interface Props {
  claim: ModeratorBusinessClaimDetail;
  /** Gọi sau khi backend xác nhận — cha nạp lại claim (KHÔNG cập nhật lạc quan). */
  onDecided: () => void;
}

const REASON_CODES = Object.keys(CLAIM_REASON_CODE_LABELS) as BusinessClaimReasonCodeValue[];

const DECISION_OPTIONS: Array<{ value: BusinessClaimDecisionValue; label: string; tone: 'approve' | 'reject' }> = [
  { value: 'approve', label: 'Duyệt — cấp quyền quản lý cơ sở', tone: 'approve' },
  { value: 'reject', label: 'Từ chối', tone: 'reject' },
];

/**
 * Form quyết định claim (POST /business-claims/{id}/decide, Business.Verify).
 *
 * CHỈ approve|reject — `disputed` là kết quả TỰ ĐỘNG phía backend khi cơ sở đã có chủ hiệu lực
 * (BR-B2), không phải một lựa chọn ở đây; `withdrawn` là hành động của chính người yêu cầu.
 *
 * `reason_code` bắt buộc khi từ chối — validate ở client cho UX, backend vẫn là nơi cưỡng chế
 * (422 nếu thiếu). Không cập nhật lạc quan: chỉ phản ánh sau khi server xác nhận (onDecided).
 */
export function ClaimDecisionForm({ claim, onDecided }: Props) {
  const [decision, setDecision] = useState<BusinessClaimDecisionValue | null>(null);
  const [reasonCode, setReasonCode] = useState<BusinessClaimReasonCodeValue>('insufficient_evidence');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Chỉ claim đang `pending` mới quyết định được (FSM backend: assertValidClaimTransition).
  if (claim.status !== 'pending') {
    return (
      <p className={styles.reviewMuted}>
        Yêu cầu này đã được xử lý — không còn hành động nào.
      </p>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!decision || submitting) return;

    setError(null);
    const session = readSession();
    if (!session) {
      setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    const body: DecideBusinessClaimRequest = { decision };
    if (decision === 'reject') body.reason_code = reasonCode;
    const trimmedNote = note.trim();
    if (trimmedNote) body.decision_note = trimmedNote;

    setSubmitting(true);
    try {
      await decideBusinessClaim(claim.id, body, session.accessToken);
      setSuccess(true);
      onDecided();
    } catch (err) {
      setError(decideClaimErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={placeMgmtStyles.form} onSubmit={onSubmit} aria-busy={submitting}>
      {error && (
        <p className={placeMgmtStyles.alert} role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className={placeMgmtStyles.success} role="status">
          Đã ghi nhận quyết định. Đang cập nhật trạng thái…
        </p>
      )}

      <fieldset className={styles.decisionOptions}>
        <legend className={styles.decisionLegend}>Quyết định</legend>
        {DECISION_OPTIONS.map((o) => (
          <label
            key={o.value}
            className={`${styles.decisionOption} ${o.tone === 'approve' ? styles.optApprove : styles.optReject}`}
          >
            <input
              type="radio"
              name="claim-decision"
              value={o.value}
              checked={decision === o.value}
              onChange={() => {
                setDecision(o.value);
                setError(null);
                setSuccess(false);
              }}
              disabled={submitting}
            />
            {o.label}
          </label>
        ))}
      </fieldset>

      {decision === 'approve' && (
        <p className={styles.reviewMuted}>
          Người yêu cầu sẽ trở thành chủ cơ sở và có quyền chỉnh sửa thông tin, giờ mở cửa, liên hệ
          và người quản lý của cơ sở này. Cơ sở cũng được đánh dấu đã xác minh chính chủ.
        </p>
      )}

      {decision === 'reject' && (
        <div className={placeMgmtStyles.fieldGrid}>
          <label htmlFor="claim-reason-code">
            Lý do từ chối <span className={placeMgmtStyles.requiredMark}>*</span>
          </label>
          <select
            id="claim-reason-code"
            className={placeMgmtStyles.input}
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value as BusinessClaimReasonCodeValue)}
            required
            aria-required="true"
            disabled={submitting}
          >
            {REASON_CODES.map((code) => (
              <option key={code} value={code}>
                {CLAIM_REASON_CODE_LABELS[code]}
              </option>
            ))}
          </select>
        </div>
      )}

      {decision && (
        <div className={placeMgmtStyles.fieldGrid}>
          <label htmlFor="claim-decision-note">Ghi chú nội bộ (tuỳ chọn)</label>
          <textarea
            id="claim-decision-note"
            className={placeMgmtStyles.textarea}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            rows={3}
            disabled={submitting}
          />
          <p className={placeMgmtStyles.fieldHint}>Tối đa 300 ký tự. Người yêu cầu không đọc được ghi chú này.</p>
        </div>
      )}

      <div className={placeMgmtStyles.actions}>
        <button type="submit" className={placeMgmtStyles.submitBtn} disabled={!decision || submitting}>
          {submitting ? 'Đang gửi…' : decision === 'approve' ? 'Duyệt yêu cầu' : decision === 'reject' ? 'Từ chối yêu cầu' : 'Chọn một quyết định'}
        </button>
      </div>
    </form>
  );
}

// Thông điệp an toàn (không lộ lỗi kỹ thuật). 4xx của BE là tiếng Việt an toàn; 5xx/mạng -> chung.
export function decideClaimErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) {
      return 'Bạn không thể quyết định yêu cầu này (không đủ quyền, hoặc đây là yêu cầu do chính bạn gửi).';
    }
    if (err.status === 404) return 'Yêu cầu này không còn tồn tại.';
    if (err.status === 409) {
      return 'Yêu cầu đã được người khác xử lý trong lúc bạn thao tác. Vui lòng tải lại để xem trạng thái mới nhất.';
    }
    if (err.status < 500) return err.message; // 422 — thông điệp BE an toàn
  }
  return 'Không ghi nhận được quyết định. Vui lòng thử lại.';
}
