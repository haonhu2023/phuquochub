'use client';

import { useState } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { resolveListingReport } from './api/listing-reports.api';
import type { ListingReportDecision, ListingReportView } from './types';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';
import placeStyles from '@/modules/places/places.module.css';

interface Props {
  report: ListingReportView;
  onResolved: () => void;
}

export function ListingReportDecisionForm({ report, onResolved }: Props) {
  const [submitting, setSubmitting] = useState<ListingReportDecision | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(decision: ListingReportDecision) {
    const session = readSession();
    if (!session) {
      setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }
    setSubmitting(decision);
    setError(null);
    try {
      await resolveListingReport(report.id, decision, session.accessToken);
      onResolved();
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : 'Không xử lý được. Vui lòng thử lại.');
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div style={{ marginTop: '0.5rem' }}>
      {error && (
        <p role="alert" className={placeMgmtStyles.alert}>
          {error}
        </p>
      )}
      <div className={placeMgmtStyles.actions}>
        <button type="button" className={placeMgmtStyles.submitBtn} disabled={submitting !== null} onClick={() => act('resolved')}>
          {submitting === 'resolved' ? 'Đang xử lý…' : 'Xác nhận hợp lệ (đã xử lý)'}
        </button>
        <button type="button" className={placeStyles.btn} disabled={submitting !== null} onClick={() => act('dismissed')}>
          {submitting === 'dismissed' ? 'Đang xử lý…' : 'Bỏ qua báo cáo'}
        </button>
      </div>
    </div>
  );
}
