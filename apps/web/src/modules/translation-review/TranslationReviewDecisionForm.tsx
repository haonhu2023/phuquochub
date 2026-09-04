'use client';

import { useState, type FormEvent } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { reviewTranslation } from './api/translation-review.api';
import { notesRequiredFor, REVIEW_NOTES_MAX_LENGTH, type TranslationReviewDecision, type TranslationReviewQueueItem } from './types';
import { HUMAN_REVIEW_STATUS_LABELS, labelOf } from './labels';
import styles from '../moderation/moderation.module.css';

const DECISION_META: Record<TranslationReviewDecision, { label: string; tone: 'approve' | 'remove' }> = {
  APPROVED: { label: 'Duyệt', tone: 'approve' },
  NEEDS_CHANGES: { label: 'Cần sửa lại', tone: 'remove' },
  REJECTED: { label: 'Từ chối', tone: 'remove' },
};

interface Props {
  item: TranslationReviewQueueItem;
  /** Gọi sau khi BE xác nhận thành công — cha nạp lại hàng chờ (KHÔNG optimistic — cùng quy ước
   *  ModerationDecisionForm: chỉ phản ánh sau khi server xác nhận). */
  onDecided: () => void;
}

// Form quyết định cho MỘT bản dịch: Duyệt / Cần sửa lại / Từ chối + ghi chú. Gửi ĐÚNG {decision,
// notes} lên BE — không có trường reviewer/timestamp/publication flag nào ở đây, BE tự suy ra tất
// cả từ phiên đăng nhập (xem translation-review.api.ts). Chặn double-submit bằng `submitting`
// (disable nút, KHÔNG chỉ ẩn — double-click trong lúc request đầu còn treo vẫn bị chặn).
export function TranslationReviewDecisionForm({ item, onDecided }: Props) {
  const [selected, setSelected] = useState<TranslationReviewDecision | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  if (item.human_review_status !== 'PENDING' && item.human_review_status !== 'NEEDS_CHANGES') {
    // Phòng thủ: hàng chờ chỉ nên chứa PENDING/NEEDS_CHANGES (BE lọc sẵn), nhưng nếu dữ liệu cũ
    // trong state client đã bị người khác duyệt xong (chưa refetch), đừng hiện lại form.
    return (
      <p className={styles.previewEmpty}>
        Đã có quyết định: {labelOf(HUMAN_REVIEW_STATUS_LABELS, item.human_review_status)}.
      </p>
    );
  }

  const notesTrimmed = notes.trim();
  const notesMissing = !!selected && notesRequiredFor(selected) && !notesTrimmed;
  const notesTooLong = notesTrimmed.length > REVIEW_NOTES_MAX_LENGTH;
  const submitDisabled = !selected || submitting || notesMissing || notesTooLong;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || submitting) return; // chặn double-click ngay cả khi nút chưa kịp disable lại
    setError(null);
    setConflict(false);

    if (notesRequiredFor(selected) && !notesTrimmed) {
      setError('Vui lòng nhập ghi chú — bắt buộc cho quyết định này.');
      return;
    }
    if (notesTooLong) {
      setError(`Ghi chú tối đa ${REVIEW_NOTES_MAX_LENGTH} ký tự.`);
      return;
    }
    const session = readSession();
    if (!session) {
      setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    setSubmitting(true);
    try {
      await reviewTranslation(item.id, { decision: selected, notes: notesTrimmed || undefined }, session.accessToken);
      onDecided(); // refetch: trạng thái phản ánh state đã commit ở server
    } catch (err) {
      if (err instanceof ApiError && err.isConflict) {
        // Nội dung đã bị sửa hoặc đã được người khác duyệt trong lúc bạn đang xem — KHÔNG tự thử
        // lại (có thể ghi đè một quyết định vừa hợp lệ của người khác). Chỉ báo và yêu cầu tải lại.
        setConflict(true);
      } else {
        setError(decideErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (conflict) {
    return (
      <p className={styles.alert} role="alert">
        Bản dịch này đã bị sửa hoặc đã được người khác duyệt trong lúc bạn đang xem. Vui lòng tải
        lại hàng chờ để xem trạng thái mới nhất trước khi quyết định.{' '}
        <button type="button" className={styles.submitBtn} onClick={onDecided}>
          Tải lại hàng chờ
        </button>
      </p>
    );
  }

  return (
    <form className={styles.decision} onSubmit={onSubmit} aria-busy={submitting}>
      {error && (
        <p className={styles.alert} role="alert">
          {error}
        </p>
      )}

      <fieldset className={styles.decisionOptions}>
        <legend className={styles.decisionLegend}>Chọn quyết định</legend>
        {(Object.keys(DECISION_META) as TranslationReviewDecision[]).map((decision) => (
          <label
            key={decision}
            className={`${styles.decisionOption} ${DECISION_META[decision].tone === 'approve' ? styles.optApprove : styles.optRemove}`}
          >
            <input
              type="radio"
              name={`decision-${item.id}`}
              value={decision}
              checked={selected === decision}
              onChange={() => {
                setSelected(decision);
                setError(null);
              }}
            />
            {DECISION_META[decision].label}
          </label>
        ))}
      </fieldset>

      <div className={styles.fieldBlock}>
        <label htmlFor={`tr-notes-${item.id}`}>
          Ghi chú {selected && notesRequiredFor(selected) ? '(bắt buộc)' : '(tuỳ chọn)'}
        </label>
        <textarea
          id={`tr-notes-${item.id}`}
          className={styles.reason}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={REVIEW_NOTES_MAX_LENGTH}
          required={!!selected && notesRequiredFor(selected)}
          aria-required={!!selected && notesRequiredFor(selected)}
          placeholder={
            selected === 'REJECTED'
              ? 'Vì sao từ chối? (bắt buộc)'
              : selected === 'NEEDS_CHANGES'
                ? 'Cần sửa gì cụ thể? (bắt buộc)'
                : 'Ghi chú thêm cho hồ sơ duyệt (tuỳ chọn)'
          }
        />
        <p className={styles.previewEmpty}>
          {notesTrimmed.length}/{REVIEW_NOTES_MAX_LENGTH} ký tự
        </p>
      </div>

      <div className={styles.actions}>
        <button type="submit" className={styles.submitBtn} disabled={submitDisabled}>
          {submitting
            ? 'Đang gửi…'
            : selected
              ? `Áp dụng: ${DECISION_META[selected].label}`
              : 'Chọn một quyết định'}
        </button>
      </div>
    </form>
  );
}

// Thông điệp an toàn cho người dùng (không lộ lỗi kỹ thuật). 4xx của BE là tiếng Việt an toàn;
// 5xx/mạng -> thông báo chung.
function decideErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Bạn không có quyền duyệt bản dịch này.';
    if (err.status === 404) return 'Bản dịch không còn tồn tại.';
    if (err.status < 500) return err.message; // 400 (ghi chú thiếu/quá dài…) — thông điệp BE an toàn
  }
  return 'Không thực hiện được quyết định. Vui lòng thử lại.';
}
