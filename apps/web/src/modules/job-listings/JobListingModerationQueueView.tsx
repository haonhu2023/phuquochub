'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { listPendingJobListings } from './api/job-listings.api';
import { JobListingDecisionForm } from './JobListingDecisionForm';
import { jobListingEmploymentTypeLabel, type JobListingModeratorView } from './types';
import { formatSalary } from './salary';
import { RichDescriptionRenderer } from '../rich-doc/RichDescriptionRenderer';
import placeStyles from '@/modules/places/places.module.css';

type State =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: JobListingModeratorView[] };

// Hàng chờ duyệt tin tuyển dụng (JobListing.Moderate). Không có khái niệm "giá trị gốc" để so
// sánh như place-edit-proposals — một tin tuyển dụng không có bản "trước" (khác sửa một field của
// place đã công khai), nên không cần preview song song nào.
export function JobListingModerationQueueView() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const session = readSession();
    let cancelled = false;
    if (!session) {
      void Promise.resolve().then(() => {
        if (!cancelled) setState({ kind: 'forbidden' });
      });
      return () => {
        cancelled = true;
      };
    }
    void Promise.resolve()
      .then(() => {
        if (!cancelled) setState({ kind: 'loading' });
        return listPendingJobListings(session.accessToken);
      })
      .then((items) => {
        if (!cancelled) setState({ kind: 'ready', items });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 403 || err.status === 401)) {
          setState({ kind: 'forbidden' });
        } else {
          setState({ kind: 'error', message: safeMessage(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  if (state.kind === 'forbidden') {
    return (
      <main>
        <h1>Duyệt tin tuyển dụng</h1>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không có quyền truy cập</p>
          <p>
            Bạn không có quyền <code>JobListing.Moderate</code> để xem trang này.
          </p>
          <Link href="/dashboard" className={placeStyles.btn}>
            ← Về bảng điều khiển
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Duyệt tin tuyển dụng</h1>
        <p className={placeStyles.pageLede}>
          Tin được duyệt sẽ hiện công khai ngay, kèm cả thông tin liên hệ chủ tin đã nhập.
        </p>
      </header>

      {state.kind === 'loading' && (
        <div aria-busy="true" aria-label="Đang tải hàng chờ">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              style={{ height: '6rem', borderRadius: '0.5rem', background: 'var(--surface-2, #eee)', marginBottom: '0.75rem' }}
            />
          ))}
        </div>
      )}

      {state.kind === 'error' && (
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không tải được hàng chờ</p>
          <p>{state.message}</p>
          <button type="button" className={placeStyles.btn} onClick={reload}>
            Thử lại
          </button>
        </div>
      )}

      {state.kind === 'ready' && state.items.length === 0 && (
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>Hàng chờ trống</p>
          <p>Không có tin tuyển dụng nào đang chờ duyệt.</p>
        </div>
      )}

      {state.kind === 'ready' && state.items.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.75rem' }}>
          {state.items.map((job) => (
            <li key={job.id} className={placeStyles.state}>
              <p className={placeStyles.stateTitle}>
                {job.title} — {job.employer_name}
              </p>
              <p>
                {job.work_location}
                {job.ward ? ` (${job.ward})` : ''} · {jobListingEmploymentTypeLabel(job.employment_type, 'vi')} ·{' '}
                {formatSalary(job)}
              </p>
              {job.description && <RichDescriptionRenderer richDoc={job.description_rich} plainFallback={job.description} />}
              {job.requirements && (
                <p>
                  <strong>Yêu cầu:</strong> {job.requirements}
                </p>
              )}
              <p>
                Liên hệ: {job.contact_method} — {job.contact_value}
              </p>
              <JobListingDecisionForm job={job} onDecided={reload} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function safeMessage(err: unknown): string {
  if (err instanceof ApiError && err.status < 500) return err.message;
  return 'Đã xảy ra lỗi khi tải hàng chờ tin tuyển dụng. Vui lòng thử lại.';
}
