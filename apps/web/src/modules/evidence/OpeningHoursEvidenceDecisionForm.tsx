'use client';

import { useState, type FormEvent } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { reviewOpeningHoursEvidence } from './api/opening-hours-evidence.api';
import type { EvidenceReviewDecision, OpeningHoursEvidencePendingView, ScheduleStability } from './types';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';

interface Props {
  item: OpeningHoursEvidencePendingView;
  onDecided: () => void;
}

const DECISIONS: { value: EvidenceReviewDecision; label: string; requiresNote: boolean }[] = [
  { value: 'APPROVE', label: 'Duyệt — đủ bằng chứng', requiresNote: false },
  { value: 'NEEDS_CHANGES', label: 'Cần bổ sung', requiresNote: true },
  { value: 'REJECT', label: 'Từ chối', requiresNote: true },
];

export function OpeningHoursEvidenceDecisionForm({ item, onDecided }: Props) {
  const [selected, setSelected] = useState<EvidenceReviewDecision | null>(null);
  const [scheduleStability, setScheduleStability] = useState<ScheduleStability>(item.schedule_stability_claimed ?? 'STABLE');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ eligible: boolean; reasonCodes: string[]; linked: boolean } | null>(null);

  const current = DECISIONS.find((d) => d.value === selected) ?? null;
  const noteMissing = !!current?.requiresNote && !note.trim();
  const submitDisabled = !current || submitting || noteMissing;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!current || submitting) return;
    setError(null);
    if (current.requiresNote && !note.trim()) {
      setError('Vui lòng ghi lý do — người nộp sẽ dựa vào đây để bổ sung.');
      return;
    }
    const session = readSession();
    if (!session) {
      setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await reviewOpeningHoursEvidence(
        item.evidence_artifact_id,
        { decision: current.value, schedule_stability: scheduleStability, ...(note.trim() ? { review_note: note.trim() } : {}) },
        session.accessToken,
      );
      setResult({ eligible: res.eligible, reasonCodes: res.reason_codes, linked: res.linked_to_public_gate });
      onDecided();
    } catch (err) {
      setError(decideErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <p className={result.linked ? placeMgmtStyles.success : placeMgmtStyles.alert} role="status">
        {result.linked
          ? 'Đã duyệt — giờ mở cửa này giờ đã đủ điều kiện hiện công khai.'
          : `Đã ghi nhận quyết định nhưng KHÔNG đủ điều kiện hiện công khai (${result.reasonCodes.join(', ')}).`}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} aria-busy={submitting} style={{ marginTop: '0.75rem' }}>
      {error && (
        <p className={placeMgmtStyles.alert} role="alert">
          {error}
        </p>
      )}
      <fieldset style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', border: 'none', padding: 0 }}>
        {DECISIONS.map((d) => (
          <label key={d.value} style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
            <input
              type="radio"
              name={`decision-${item.evidence_artifact_id}`}
              value={d.value}
              checked={selected === d.value}
              onChange={() => {
                setSelected(d.value);
                setError(null);
              }}
            />
            {d.label}
          </label>
        ))}
      </fieldset>
      <label style={{ display: 'block', marginTop: '0.5rem' }}>
        Tính ổn định của lịch (người duyệt tự xác nhận lại):{' '}
        <select value={scheduleStability} onChange={(e) => setScheduleStability(e.target.value as ScheduleStability)}>
          <option value="STABLE">Lịch thường xuyên, ổn định</option>
          <option value="TEMPORARY">Thông báo tạm thời</option>
        </select>
      </label>
      {current?.requiresNote && (
        <textarea
          aria-label="Lý do (bắt buộc)"
          className={placeMgmtStyles.textarea}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
          rows={2}
          placeholder="Vì sao cần bổ sung/từ chối…"
          required
        />
      )}
      <div style={{ marginTop: '0.5rem' }}>
        <button type="submit" className={placeMgmtStyles.submitBtn} disabled={submitDisabled}>
          {submitting ? 'Đang gửi…' : current ? `Xác nhận: ${current.label}` : 'Chọn một quyết định'}
        </button>
      </div>
    </form>
  );
}

function decideErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Bạn không có quyền xử lý bằng chứng này.';
    if (err.status === 404) return 'Bằng chứng không còn tồn tại.';
    if (err.status < 500) return err.message;
  }
  return 'Không thực hiện được quyết định. Vui lòng thử lại.';
}
