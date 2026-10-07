'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { closeJobListing, listMyJobListings, reopenJobListing, submitJobListing } from './api/job-listings.api';
import { JOB_LISTING_STATUS_LABELS, jobListingEmploymentTypeLabel, type JobListingSenderView } from './types';
import { formatSalary } from './salary';
import placeStyles from '@/modules/places/places.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: JobListingSenderView[] };

function formatDate(iso: string | null): string {
  if (!iso) return 'chưa có';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'chưa có' : d.toLocaleDateString('vi-VN');
}

// "Tin của tôi": mọi trạng thái (draft/pending/published/rejected/closed). Mỗi hành động (gửi
// duyệt/đóng/mở lại) gọi THẲNG API tương ứng rồi nạp lại toàn bộ danh sách (KHÔNG optimistic) —
// cùng quy ước MyProposalsView/ClaimsReviewView: trạng thái hiển thị luôn là trạng thái backend
// vừa xác nhận, không phải một suy đoán ở client.
export function MyJobListingsView() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    const session = readSession();
    let cancelled = false;
    if (!session) {
      void Promise.resolve().then(() => {
        if (!cancelled) setState({ kind: 'error', message: 'Phiên đăng nhập đã hết hạn — tải lại trang.' });
      });
      return () => {
        cancelled = true;
      };
    }
    void Promise.resolve()
      .then(() => {
        if (!cancelled) setState({ kind: 'loading' });
        return listMyJobListings(session.accessToken);
      })
      .then((items) => {
        if (!cancelled) setState({ kind: 'ready', items });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ kind: 'error', message: safeMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function act(id: string, action: 'submit' | 'close' | 'reopen') {
    const session = readSession();
    if (!session) {
      setActionError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }
    setActingId(id);
    setActionError(null);
    try {
      const fn = action === 'submit' ? submitJobListing : action === 'close' ? closeJobListing : reopenJobListing;
      await fn(id, session.accessToken);
      reload();
    } catch (err) {
      setActionError(safeMessage(err));
    } finally {
      setActingId(null);
    }
  }

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Tin tuyển dụng của tôi</h1>
        <p className={placeStyles.pageLede}>
          Đăng tin tuyển dụng địa phương — tin cần được duyệt trước khi hiện công khai.
        </p>
      </header>

      <div className={placeMgmtStyles.actions} style={{ marginBottom: '1rem' }}>
        <Link href="/dashboard/job-listings/new" className={placeStyles.btn}>
          + Đăng tin mới
        </Link>
      </div>

      {actionError && (
        <p className={placeMgmtStyles.alert} role="alert">
          {actionError}
        </p>
      )}

      {state.kind === 'loading' && (
        <div aria-busy="true" aria-label="Đang tải danh sách">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              style={{ height: '5rem', borderRadius: '0.5rem', background: 'var(--surface-2, #eee)', marginBottom: '0.75rem' }}
            />
          ))}
        </div>
      )}

      {state.kind === 'error' && (
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không tải được danh sách</p>
          <p>{state.message}</p>
          <button type="button" className={placeStyles.btn} onClick={reload}>
            Thử lại
          </button>
        </div>
      )}

      {state.kind === 'ready' && state.items.length === 0 && (
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>Chưa có tin nào</p>
          <p>Bạn chưa đăng tin tuyển dụng nào.</p>
        </div>
      )}

      {state.kind === 'ready' && state.items.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.75rem' }}>
          {state.items.map((job) => (
            <li key={job.id} className={placeStyles.state}>
              <p className={placeStyles.stateTitle}>
                {job.title} — {JOB_LISTING_STATUS_LABELS[job.status]}
              </p>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                {job.employer_name} · {jobListingEmploymentTypeLabel(job.employment_type, 'vi')} · {formatSalary(job)}
              </p>
              {job.status === 'rejected' && job.review_note && (
                <p style={{ color: 'var(--danger, #b91c1c)' }}>Lý do từ chối: {job.review_note}</p>
              )}
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                Tạo ngày {formatDate(job.created_at)}
                {job.reviewed_at ? `; xử lý ngày ${formatDate(job.reviewed_at)}` : ''}
              </p>

              <div className={placeMgmtStyles.actions}>
                {(job.status === 'draft' || job.status === 'pending' || job.status === 'rejected') && (
                  <Link href={`/dashboard/job-listings/${job.id}/edit`} className={placeStyles.btn}>
                    Sửa
                  </Link>
                )}
                {(job.status === 'draft' || job.status === 'rejected') && (
                  <button
                    type="button"
                    className={placeMgmtStyles.submitBtn}
                    disabled={actingId === job.id}
                    onClick={() => act(job.id, 'submit')}
                  >
                    Gửi duyệt
                  </button>
                )}
                {job.status === 'published' && (
                  <>
                    <Link href={`/dashboard/job-listings/${job.id}/edit`} className={placeStyles.btn}>
                      Sửa (ẩn tin, cần duyệt lại)
                    </Link>
                    <button
                      type="button"
                      className={placeMgmtStyles.submitBtn}
                      disabled={actingId === job.id}
                      onClick={() => act(job.id, 'close')}
                    >
                      Đóng tin
                    </button>
                  </>
                )}
                {job.status === 'closed' && (
                  <button
                    type="button"
                    className={placeMgmtStyles.submitBtn}
                    disabled={actingId === job.id}
                    onClick={() => act(job.id, 'reopen')}
                  >
                    Mở lại (cần duyệt lại)
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function safeMessage(err: unknown): string {
  if (err instanceof ApiError && err.status < 500) return err.message;
  return 'Đã xảy ra lỗi. Vui lòng thử lại.';
}
