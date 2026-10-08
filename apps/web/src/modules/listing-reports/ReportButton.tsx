'use client';

import { useState, type FormEvent } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { createListingReport } from './api/listing-reports.api';
import { LISTING_REPORT_REASONS, LISTING_REPORT_REASON_LABELS, type ListingReportReason, type ListingReportTargetType } from './types';
import uiStyles from '@/components/ui/ui.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';
import placeStyles from '@/modules/places/places.module.css';

interface Props {
  targetType: ListingReportTargetType;
  targetId: string;
}

// Nút "Báo sai/báo trùng" dùng chung — mở form nội tuyến (lý do + ghi chú tuỳ chọn), gửi xong hiện
// xác nhận và đóng form lại (không có khái niệm "đã báo cáo" bền vững ở client — chưa có endpoint
// kiểm tra, xem listing-reports.service.ts's comment phía API: gọi lại vẫn tạo một báo cáo mới,
// khác lưu tin (idempotent qua ON CONFLICT), vì nhiều người có thể hợp lệ báo cùng một tin).
export function ReportButton({ targetType, targetId }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ListingReportReason>('wrong_info');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <p role="status" style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        Cảm ơn bạn đã báo cáo — quản trị viên sẽ xem xét.
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" className={placeStyles.btn} onClick={() => setOpen(true)}>
        ⚑ Báo sai / báo trùng
      </button>
    );
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    const session = readSession();
    if (!session) {
      setError('Đăng nhập để báo cáo tin này.');
      return;
    }
    setSubmitting(true);
    try {
      await createListingReport({ target_type: targetType, target_id: targetId, reason, description: description.trim() || undefined }, session.accessToken);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : 'Không gửi được báo cáo. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={submitting} style={{ marginTop: '0.5rem', maxWidth: '24rem' }}>
      {error && (
        <p role="alert" className={placeMgmtStyles.alert}>
          {error}
        </p>
      )}
      <div className={uiStyles.field}>
        <label className={uiStyles.fieldLabel} htmlFor="report-reason">
          Lý do
        </label>
        <select
          id="report-reason"
          className={uiStyles.select}
          value={reason}
          onChange={(e) => setReason(e.target.value as ListingReportReason)}
          disabled={submitting}
        >
          {LISTING_REPORT_REASONS.map((r) => (
            <option key={r} value={r}>
              {LISTING_REPORT_REASON_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <div className={uiStyles.field} style={{ marginTop: '0.5rem' }}>
        <label className={uiStyles.fieldLabel} htmlFor="report-description">
          Ghi chú (không bắt buộc)
        </label>
        <textarea
          id="report-description"
          className={placeMgmtStyles.textarea}
          rows={2}
          maxLength={1000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={submitting}
        />
      </div>
      <div className={placeMgmtStyles.actions} style={{ marginTop: '0.5rem' }}>
        <button type="submit" className={placeMgmtStyles.submitBtn} disabled={submitting}>
          {submitting ? 'Đang gửi…' : 'Gửi báo cáo'}
        </button>
        <button type="button" className={placeStyles.btn} onClick={() => setOpen(false)} disabled={submitting}>
          Huỷ
        </button>
      </div>
    </form>
  );
}
