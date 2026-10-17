'use client';

import { useState, type FormEvent } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { decideRealEstateListingTranslation } from './api/real-estate-listings.api';
import type { RealEstateDecision, RealEstateListingTranslationModeratorView } from './types';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';

interface Props {
  translation: RealEstateListingTranslationModeratorView;
  onDecided: () => void;
}

const DECISIONS: { value: RealEstateDecision; label: string; requiresNote: boolean }[] = [
  { value: 'approve', label: 'Duyệt — đăng công khai', requiresNote: false },
  { value: 'reject', label: 'Từ chối', requiresNote: true },
];

// Cùng khuôn JobListingTranslationDecisionForm.tsx (xem ghi chú đầy đủ ở đó) — luôn gửi
// `expected_content_version` (CAS).
export function RealEstateListingTranslationDecisionForm({ translation, onDecided }: Props) {
  const [selected, setSelected] = useState<RealEstateDecision | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = DECISIONS.find((d) => d.value === selected) ?? null;
  const noteMissing = !!current?.requiresNote && !note.trim();
  const submitDisabled = !current || submitting || noteMissing;

  if (translation.status !== 'pending') return null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!current || submitting) return;
    setError(null);
    if (current.requiresNote && !note.trim()) {
      setError('Vui lòng ghi lý do từ chối — chủ tin sẽ thấy để sửa trước khi gửi lại.');
      return;
    }
    const session = readSession();
    if (!session) {
      setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    setSubmitting(true);
    try {
      await decideRealEstateListingTranslation(
        translation.real_estate_listing_id,
        { decision: current.value, expected_content_version: translation.content_version, ...(note.trim() ? { note: note.trim() } : {}) },
        session.accessToken,
      );
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
              name={`re-translation-decision-${translation.real_estate_listing_id}`}
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
          aria-label="Lý do từ chối (bắt buộc)"
          className={placeMgmtStyles.textarea}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={2}
          placeholder="Vì sao từ chối — chủ tin sẽ thấy nội dung này…"
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
    if (err.status === 409) return 'Bản dịch này vừa được người đăng sửa hoặc đã bị xử lý. Vui lòng tải lại hàng chờ.';
    if (err.status === 403) return 'Bạn không có quyền xử lý bản dịch này.';
    if (err.status === 404) return 'Bản dịch không còn tồn tại.';
    if (err.status < 500) return err.message;
  }
  return 'Không thực hiện được quyết định. Vui lòng thử lại.';
}
