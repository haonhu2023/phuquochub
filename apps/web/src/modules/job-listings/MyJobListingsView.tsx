'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { closeJobListing, listMyJobListings, reopenJobListing, submitJobListing } from './api/job-listings.api';
import { JOB_LISTING_STATUS_LABELS, jobListingEmploymentTypeLabel, type JobListingSenderView } from './types';
import { formatSalary } from './salary';
import { confirmListingStillValid, listMyOpenListingReports } from '@/modules/listing-reports/api/listing-reports.api';
import { LISTING_REPORT_REASON_LABELS, type ListingReportView } from '@/modules/listing-reports/types';
import placeStyles from '@/modules/places/places.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';
import {
  LISTING_EFFECTIVE_STATUS_LABELS,
  listingEffectiveStatus,
  matchesListingFilter,
  useTodayInVietnam,
  type ListingFilterValue,
} from '@/lib/listingExpiry';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: JobListingSenderView[] };

function formatDate(iso: string | null): string {
  if (!iso) return 'chưa có';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'chưa có' : d.toLocaleDateString('vi-VN');
}

// Hạn tuyển dùng CHÍNH cột `expires_at` (YYYY-MM-DD, không có giờ) — format trực tiếp, KHÔNG qua
// `new Date(iso)` như formatDate() ở trên (đổi "2026-06-01" qua Date rồi toLocaleDateString có thể
// lệch một ngày tuỳ múi giờ trình duyệt người xem; chuỗi YYYY-MM-DD tự nó đã rõ ràng, chỉ cần đảo
// thứ tự hiển thị).
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

// "Tin của tôi": mọi trạng thái (draft/pending/published/rejected/closed). Mỗi hành động (gửi
// duyệt/đóng/mở lại) gọi THẲNG API tương ứng rồi nạp lại toàn bộ danh sách (KHÔNG optimistic) —
// cùng quy ước MyProposalsView/ClaimsReviewView: trạng thái hiển thị luôn là trạng thái backend
// vừa xác nhận, không phải một suy đoán ở client.
export function MyJobListingsView() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ListingFilterValue>('all');
  // Giai đoạn 2 (21/10/2026) — báo cáo "còn đúng không?" đang mở trên tin của mình, gộp theo
  // target_id. Tải RIÊNG, không chặn danh sách tin chính nếu lỗi (chỉ là thông tin bổ sung — một
  // tin vẫn phải hiện được dù không tải được báo cáo của nó).
  const [openReports, setOpenReports] = useState<ListingReportView[]>([]);
  // Tự cập nhật khi sang ngày mới (kể cả không ai thao tác gì) — xem ghi chú đầy đủ ở
  // useTodayInVietnam() trong listingExpiry.ts.
  const today = useTodayInVietnam();

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
    listMyOpenListingReports('job_listing', session.accessToken)
      .then((items) => {
        if (!cancelled) setOpenReports(items);
      })
      .catch(() => {
        /* không chặn trang chính nếu lỗi — xem ghi chú state ở trên */
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

  // Giai đoạn 2 (21/10/2026) — xác nhận TẤT CẢ báo cáo đang mở trên MỘT tin trong một lần bấm (một
  // tin có thể bị nhiều người báo cùng lý do) — gọi tuần tự, không song song, để lỗi giữa chừng
  // không để lại trạng thái nửa vời khó debug. Dùng CHÍNH jobId làm khoá actingId (giống
  // submit/close/reopen) để không cho bấm hai hành động cùng lúc trên cùng một tin.
  async function confirmStillHiring(jobId: string, reportIds: string[]) {
    const session = readSession();
    if (!session) {
      setActionError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }
    setActingId(jobId);
    setActionError(null);
    try {
      for (const reportId of reportIds) {
        await confirmListingStillValid(reportId, session.accessToken);
      }
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

      {state.kind === 'ready' && state.items.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="jl-filter" style={{ marginRight: '0.5rem' }}>
            Lọc theo trạng thái
          </label>
          <select id="jl-filter" value={filter} onChange={(e) => setFilter(e.target.value as ListingFilterValue)}>
            {FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

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

      {state.kind === 'ready' && state.items.length > 0 && (() => {
        const filtered = state.items.filter((job) => matchesListingFilter(job, filter, today));
        if (filtered.length === 0) {
          return (
            <div className={placeStyles.state}>
              <p className={placeStyles.stateTitle}>Không có tin nào khớp bộ lọc</p>
              <p>Đổi bộ lọc ở trên để xem các tin khác.</p>
            </div>
          );
        }
        return (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.75rem' }}>
          {filtered.map((job) => {
            const effectiveStatus = listingEffectiveStatus(job.status, job.expires_at, today);
            const jobOpenReports = openReports.filter((r) => r.target_id === job.id);
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
              {job.status === 'rejected' && job.review_note && (
                <p style={{ color: 'var(--danger, #b91c1c)' }}>Lý do từ chối: {job.review_note}</p>
              )}
              {/* Giai đoạn 2 (21/10/2026) — "còn đúng không?": người xem đã báo, chờ CHÍNH người
                  đăng xác nhận. Lời tự khai một phía — KHÔNG tự đổi trạng thái tin, chỉ đóng báo
                  cáo (xem confirmStillValid()'s comment phía API). */}
              {jobOpenReports.length > 0 && (
                <div style={{ background: 'var(--warning-bg, #fffbeb)', border: '1px solid var(--warning, #b45309)', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', margin: '0.5rem 0' }}>
                  <p style={{ margin: 0, color: 'var(--warning, #b45309)' }}>
                    {jobOpenReports.length} người báo: {jobOpenReports.map((r) => LISTING_REPORT_REASON_LABELS[r.reason]).join(', ')}
                  </p>
                  <button
                    type="button"
                    className={placeMgmtStyles.submitBtn}
                    disabled={actingId === job.id}
                    onClick={() => confirmStillHiring(job.id, jobOpenReports.map((r) => r.id))}
                    style={{ marginTop: '0.4rem' }}
                  >
                    Xác nhận vẫn đang tuyển
                  </button>
                </div>
              )}
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                Tạo ngày {formatDate(job.created_at)}
                {job.reviewed_at ? `; xử lý ngày ${formatDate(job.reviewed_at)}` : ''}
                {job.expires_at ? `; hạn tuyển ${formatYmd(job.expires_at)}` : ''}
              </p>
              {effectiveStatus === 'expired' && (
                <p style={{ color: 'var(--danger, #b91c1c)', fontSize: '0.85rem' }}>
                  Tin đã quá hạn tuyển ({formatYmd(job.expires_at as string)}) nên không còn hiện công khai, dù trạng thái vẫn &quot;Đang đăng&quot;. Sửa tin và đặt hạn mới rồi gửi duyệt lại để đăng tiếp.
                </p>
              )}

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
              {job.status === 'closed' && (
                <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  Tin đã đóng không sửa trực tiếp được — bấm &quot;Mở lại&quot; trước, tin sẽ về trạng thái chờ duyệt,
                  sau đó mới bấm &quot;Sửa&quot; được.
                </p>
              )}
            </li>
            );
          })}
        </ul>
        );
      })()}
    </main>
  );
}

function safeMessage(err: unknown): string {
  if (err instanceof ApiError && err.status < 500) return err.message;
  return 'Đã xảy ra lỗi. Vui lòng thử lại.';
}
