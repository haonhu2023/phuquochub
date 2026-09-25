'use client';

import { useState, type FormEvent } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { decidePlaceEditProposal } from './api/place-edit-proposals.api';
import type { PlaceEditProposalDecision, PlaceEditProposalView } from './types';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';

interface Props {
  proposal: PlaceEditProposalView;
  /** Gọi sau khi backend xác nhận — cha nạp lại hàng chờ (KHÔNG optimistic), cùng quy ước
   * ModerationDecisionForm.onDecided(). */
  onDecided: () => void;
}

const DECISIONS: { value: PlaceEditProposalDecision; label: string; requiresNote: boolean }[] = [
  { value: 'approve', label: 'Duyệt — áp dụng ngay', requiresNote: false },
  { value: 'reject', label: 'Từ chối', requiresNote: true },
  { value: 'needs_changes', label: 'Cần bổ sung', requiresNote: true },
];

// Quyết định trên MỘT đề xuất — cùng khuôn ModerationDecisionForm nhưng đơn giản hơn (không có
// reason_code/target_status, chỉ decision + note tuỳ chọn/bắt buộc). "Duyệt" áp dụng NGAY qua
// PlacesService.update() phía backend (transaction khoá + so hash giá trị gốc tại chính lúc quyết
// định) — không có bước mở editor riêng ở web, xem PlaceEditProposalsService.decide().
export function PlaceEditProposalDecisionForm({ proposal, onDecided }: Props) {
  const [selected, setSelected] = useState<PlaceEditProposalDecision | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = DECISIONS.find((d) => d.value === selected) ?? null;
  const noteMissing = !!current?.requiresNote && !note.trim();
  const submitDisabled = !current || submitting || noteMissing;

  if (proposal.status !== 'pending' && proposal.status !== 'needs_changes') {
    return null;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!current || submitting) return;
    setError(null);
    if (current.requiresNote && !note.trim()) {
      setError('Vui lòng ghi lý do cho quyết định này.');
      return;
    }
    const session = readSession();
    if (!session) {
      setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await decidePlaceEditProposal(
        proposal.id,
        { decision: current.value, ...(note.trim() ? { note: note.trim() } : {}) },
        session.accessToken,
      );
      if (result.status === 'conflict') {
        // Không phải lỗi HTTP — service phát hiện dữ liệu gốc đã đổi kể từ lúc gửi đề xuất và KHÔNG
        // áp dụng. onDecided() vẫn nạp lại để hiện đúng trạng thái CONFLICT mới.
        setError(
          'Dữ liệu gốc của địa điểm đã thay đổi kể từ khi đề xuất này được gửi — hệ thống KHÔNG tự ghi đè. Đề xuất đã chuyển sang trạng thái xung đột, xem lại giá trị hiện tại trước khi quyết định tiếp.',
        );
      }
      onDecided();
    } catch (err) {
      setError(decideErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
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
              name={`decision-${proposal.id}`}
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
      {current?.requiresNote && (
        <textarea
          aria-label="Lý do (bắt buộc)"
          className={placeMgmtStyles.textarea}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={2}
          placeholder="Vì sao từ chối / cần bổ sung gì thêm…"
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

export function decideErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) {
      return 'Đề xuất này vừa được người khác xử lý. Vui lòng tải lại để xem trạng thái mới nhất.';
    }
    if (err.status === 403) return 'Bạn không có quyền xử lý đề xuất này.';
    if (err.status === 404) return 'Đề xuất không còn tồn tại.';
    if (err.status < 500) return err.message;
  }
  return 'Không thực hiện được quyết định. Vui lòng thử lại.';
}
