'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { closeJobListing, listJobListingsForAdmin, reopenJobListing } from './api/job-listings.api';
import { JOB_LISTING_STATUS_LABELS, jobListingEmploymentTypeLabel, type JobListingAdminView, type JobListingStatus } from './types';
import { formatSalary } from './salary';
import placeStyles from '@/modules/places/places.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';
import { LISTING_EFFECTIVE_STATUS_LABELS, listingEffectiveStatus, useTodayInVietnam } from '@/lib/listingExpiry';

type State =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: JobListingAdminView[] };

function formatYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

const STATUS_OPTIONS: Array<{ value: JobListingStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'draft', label: 'Nháp' },
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'published', label: 'Đang đăng' },
  { value: 'closed', label: 'Đã đóng' },
  { value: 'rejected', label: 'Bị từ chối' },
];

// Màn hình quản lý TOÀN BỘ tin (Gói B, 17/10/2026) — KHÁC hẳn JobListingModerationQueueView (hàng
// chờ duyệt, CHỈ status=pending): ở đây admin tìm tin theo BẤT KỲ trạng thái (đang công khai, hết
// hạn, đã đóng, bị từ chối, nháp) của BẤT KỲ người đăng, không chỉ tin đang chờ xử lý. Lọc status
// gọi lại API (GET /job-listings/admin?status=...). Lọc "người đăng" là lọc CLIENT-SIDE theo
// substring khớp creator_email/creator_display_name TRÊN TRANG ĐÃ TẢI (limit=100/lần, đủ cho quy
// mô hiện tại) — API cũng nhận `created_by` (uuid) riêng nhưng admin không thuộc UUID để gõ, nên
// UI chỉ cần ô tìm theo tên/email là đủ dùng.
export function AdminJobListingsView() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState<JobListingStatus | 'all'>('all');
  const [posterQuery, setPosterQuery] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const today = useTodayInVietnam();

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

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
        return listJobListingsForAdmin(
          { status: statusFilter === 'all' ? undefined : statusFilter, limit: 100 },
          session.accessToken,
        );
      })
      .then(({ data }) => {
        if (!cancelled) setState({ kind: 'ready', items: data });
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
  }, [reloadKey, statusFilter]);

  async function act(id: string, action: 'close' | 'reopen') {
    const session = readSession();
    if (!session) {
      setActionError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }
    setActingId(id);
    setActionError(null);
    try {
      await (action === 'close' ? closeJobListing : reopenJobListing)(id, session.accessToken);
      reload();
    } catch (err) {
      setActionError(safeMessage(err));
    } finally {
      setActingId(null);
    }
  }

  if (state.kind === 'forbidden') {
    return (
      <main>
        <h1>Quản lý tất cả tin tuyển dụng</h1>
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

  const posterNeedle = posterQuery.trim().toLowerCase();
  const items = state.kind === 'ready' ? state.items : [];
  const filtered = posterNeedle
    ? items.filter(
        (j) =>
          (j.creator_display_name ?? '').toLowerCase().includes(posterNeedle) ||
          (j.creator_email ?? '').toLowerCase().includes(posterNeedle),
      )
    : items;

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Quản lý tất cả tin tuyển dụng</h1>
        <p className={placeStyles.pageLede}>
          Khác hàng chờ duyệt: xem tin của MỌI người đăng, ở MỌI trạng thái (đang công khai, hết hạn, đã đóng, bị từ
          chối, nháp). Tin đang chờ duyệt vẫn xử lý ở{' '}
          <Link href="/dashboard/job-listings/moderation">trang Duyệt tin tuyển dụng</Link>.
        </p>
      </header>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <label htmlFor="jl-admin-status" style={{ marginRight: '0.5rem' }}>
            Trạng thái
          </label>
          <select
            id="jl-admin-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as JobListingStatus | 'all')}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="jl-admin-poster" style={{ marginRight: '0.5rem' }}>
            Người đăng (tên/email)
          </label>
          <input
            id="jl-admin-poster"
            type="text"
            value={posterQuery}
            onChange={(e) => setPosterQuery(e.target.value)}
            placeholder="Gõ để lọc trong trang đang xem"
          />
        </div>
      </div>

      {actionError && (
        <p className={placeMgmtStyles.alert} role="alert">
          {actionError}
        </p>
      )}

      {state.kind === 'loading' && (
        <div aria-busy="true" aria-label="Đang tải danh sách">
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
          <p className={placeStyles.stateTitle}>Không tải được danh sách</p>
          <p>{state.message}</p>
          <button type="button" className={placeStyles.btn} onClick={reload}>
            Thử lại
          </button>
        </div>
      )}

      {state.kind === 'ready' && items.length === 0 && (
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>Không có tin nào</p>
        </div>
      )}

      {state.kind === 'ready' && items.length > 0 && filtered.length === 0 && (
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>Không có tin nào khớp bộ lọc người đăng</p>
        </div>
      )}

      {state.kind === 'ready' && filtered.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.75rem' }}>
          {filtered.map((job) => {
            const effectiveStatus = listingEffectiveStatus(job.status, job.expires_at, today);
            return (
              <li key={job.id} className={placeStyles.state}>
                <p className={placeStyles.stateTitle}>
                  {job.title} — {JOB_LISTING_STATUS_LABELS[job.status]}
                  {effectiveStatus && (
                    <span style={{ color: effectiveStatus === 'expired' ? 'var(--danger, #b91c1c)' : 'var(--warning, #b45309)' }}>
                      {' '}· {LISTING_EFFECTIVE_STATUS_LABELS[effectiveStatus]}
                    </span>
                  )}
                </p>
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                  {job.employer_name} · {jobListingEmploymentTypeLabel(job.employment_type, 'vi')} · {formatSalary(job)}
                </p>
                <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                  Người đăng: {job.creator_display_name ?? '(đã xoá tài khoản)'}
                  {job.creator_email ? ` — ${job.creator_email}` : ''}
                </p>
                {job.expires_at && <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Hạn tuyển {formatYmd(job.expires_at)}</p>}
                {job.status === 'rejected' && job.review_note && (
                  <p style={{ color: 'var(--danger, #b91c1c)' }}>Lý do từ chối: {job.review_note}</p>
                )}

                <div className={placeMgmtStyles.actions}>
                  {job.status === 'published' && (
                    <button
                      type="button"
                      className={placeMgmtStyles.submitBtn}
                      disabled={actingId === job.id}
                      onClick={() => act(job.id, 'close')}
                    >
                      Đóng tin
                    </button>
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
            );
          })}
        </ul>
      )}
    </main>
  );
}

function safeMessage(err: unknown): string {
  if (err instanceof ApiError && err.status < 500) return err.message;
  return 'Đã xảy ra lỗi. Vui lòng thử lại.';
}
