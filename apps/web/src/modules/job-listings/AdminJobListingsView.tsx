'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { closeJobListing, listJobListingsForAdmin, reopenJobListing } from './api/job-listings.api';
import { JOB_LISTING_STATUS_LABELS, jobListingEmploymentTypeLabel, type JobListingAdminView } from './types';
import { formatSalary } from './salary';
import placeStyles from '@/modules/places/places.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';
import {
  LISTING_EFFECTIVE_STATUS_LABELS,
  listingEffectiveStatus,
  matchesListingFilter,
  useTodayInVietnam,
  type ListingFilterValue,
} from '@/lib/listingExpiry';
import type { JobListingStatus } from './types';

type State =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: JobListingAdminView[]; total: number };

const PAGE_SIZE = 50;

function formatYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

const FILTER_OPTIONS: Array<{ value: ListingFilterValue; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'draft', label: 'Nháp' },
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'published', label: 'Đang đăng' },
  { value: 'expiring_soon', label: 'Sắp hết hạn' },
  { value: 'expired', label: 'Đã hết hạn' },
  { value: 'closed', label: 'Đã đóng' },
  { value: 'rejected', label: 'Bị từ chối' },
];

// Chỉ các giá trị NÀY là status thật, gửi được xuống server (?status=...) — "expiring_soon"/
// "expired"/"all" là trạng thái SUY RA từ status+expires_at (xem listingExpiry.ts), không có cột
// nào để server lọc; xử lý thuần client qua matchesListingFilter() trên các trang đã tải.
const REAL_STATUS_VALUES = new Set<string>(['draft', 'pending', 'published', 'closed', 'rejected']);
function toRealStatus(filter: ListingFilterValue): JobListingStatus | undefined {
  return REAL_STATUS_VALUES.has(filter) ? (filter as JobListingStatus) : undefined;
}

// Màn hình quản lý TOÀN BỘ tin (Gói B, 17/10/2026) — KHÁC hẳn JobListingModerationQueueView (hàng
// chờ duyệt, CHỈ status=pending): ở đây admin tìm tin theo BẤT KỲ trạng thái, kể cả "Hết hạn"/"Sắp
// hết hạn" (owner xác nhận: một tin published vẫn mang status đó dù đã hết hạn — bộ lọc phải lọc
// theo TRẠNG THÁI HIỆU LỰC, không phải chỉ cột status thật), của BẤT KỲ người đăng.
//
// Phân trang (sửa 17/10/2026 sau phản hồi owner): trước đó tải cố định 100 bản ghi một lần, không
// hiện tổng số — một admin lọc theo người đăng trên trang đó có thể nhầm "đã tìm hết" trong khi còn
// dữ liệu chưa tải. Nay tải theo trang (PAGE_SIZE), hiện rõ "đã tải X/Y", và CẢNH BÁO khi bộ lọc
// người đăng (client-side) đang chạy trên một tập CHƯA đầy đủ.
export function AdminJobListingsView() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<ListingFilterValue>('all');
  const [posterQuery, setPosterQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const today = useTodayInVietnam();

  const reload = useCallback(() => {
    setPage(1);
    setReloadKey((k) => k + 1);
  }, []);

  // Đổi bộ lọc status → tải lại TRANG 1 (thay thế danh sách, không nối thêm).
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
          { status: toRealStatus(filter), page: 1, limit: PAGE_SIZE },
          session.accessToken,
        );
      })
      .then(({ data, meta }) => {
        if (!cancelled) setState({ kind: 'ready', items: data, total: meta.total });
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
  }, [reloadKey, filter]);

  async function loadMore() {
    const session = readSession();
    if (!session || state.kind !== 'ready') return;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const { data } = await listJobListingsForAdmin(
        { status: toRealStatus(filter), page: nextPage, limit: PAGE_SIZE },
        session.accessToken,
      );
      setPage(nextPage);
      setState((prev) => (prev.kind === 'ready' ? { ...prev, items: [...prev.items, ...data] } : prev));
    } catch (err) {
      setActionError(safeMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }

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
  const loaded = state.kind === 'ready' ? state.items : [];
  const total = state.kind === 'ready' ? state.total : 0;
  const statusFiltered = loaded.filter((j) => matchesListingFilter(j, filter, today));
  const filtered = posterNeedle
    ? statusFiltered.filter(
        (j) =>
          (j.creator_display_name ?? '').toLowerCase().includes(posterNeedle) ||
          (j.creator_email ?? '').toLowerCase().includes(posterNeedle),
      )
    : statusFiltered;
  const hasMore = loaded.length < total;

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

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <div>
          <label htmlFor="jl-admin-status" style={{ marginRight: '0.5rem' }}>
            Trạng thái
          </label>
          <select
            id="jl-admin-status"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value as ListingFilterValue);
              reload();
            }}
          >
            {FILTER_OPTIONS.map((opt) => (
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
            placeholder="Gõ để lọc trong số tin đã tải"
          />
        </div>
      </div>

      {state.kind === 'ready' && (
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Đã tải {loaded.length}/{total} tin khớp trạng thái đã chọn.
          {posterNeedle && hasMore && (
            <strong style={{ color: 'var(--warning, #b45309)' }}>
              {' '}
              Bộ lọc người đăng chỉ áp dụng trong {loaded.length} tin ĐÃ TẢI — còn {total - loaded.length} tin chưa
              tải, có thể còn khớp. Bấm &quot;Tải thêm&quot; trước khi coi đây là toàn bộ kết quả.
            </strong>
          )}
        </p>
      )}

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

      {state.kind === 'ready' && loaded.length === 0 && (
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>Không có tin nào</p>
        </div>
      )}

      {state.kind === 'ready' && loaded.length > 0 && filtered.length === 0 && (
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>Không có tin nào khớp bộ lọc trong số đã tải</p>
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
                      Mở lại (về chờ duyệt — người đăng tự sửa nội dung/hạn sau đó)
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {state.kind === 'ready' && hasMore && (
        <div style={{ marginTop: '1rem' }}>
          <button type="button" className={placeStyles.btn} onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Đang tải…' : `Tải thêm (còn ${total - loaded.length})`}
          </button>
        </div>
      )}
    </main>
  );
}

function safeMessage(err: unknown): string {
  if (err instanceof ApiError && err.status < 500) return err.message;
  return 'Đã xảy ra lỗi. Vui lòng thử lại.';
}
