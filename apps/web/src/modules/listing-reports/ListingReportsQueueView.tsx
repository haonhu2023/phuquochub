'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { listPendingListingReports } from './api/listing-reports.api';
import { ListingReportDecisionForm } from './ListingReportDecisionForm';
import { LISTING_REPORT_REASON_LABELS, type ListingReportTargetType, type ListingReportView } from './types';
import placeStyles from '@/modules/places/places.module.css';

type State =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: ListingReportView[] };

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('vi-VN');
}

// Giai đoạn 1 (21/10/2026) — `PlaceDetail` dùng `.name`, job/BĐS dùng `.title`; phân biệt ở ĐÚNG
// MỘT nơi này thay vì đoán theo cấu trúc object ở nơi gọi.
function listingLabel(listing: ListingReportView['listing']): string {
  if (!listing) return '(tin không còn khả dụng)';
  return 'title' in listing ? listing.title : listing.name;
}

const TARGET_TYPE_LABELS: Record<ListingReportTargetType, string> = {
  job_listing: 'Tuyển dụng',
  real_estate_listing: 'Bất động sản',
  place: 'Địa điểm',
};

// Hàng chờ "Báo sai/báo trùng" — GỘP cả job_listing lẫn real_estate_listing trong MỘT trang
// (API tự lọc theo quyền Moderate của từng loại caller giữ, xem listing-reports.service.ts).
// "Chưa đăng nhập hoặc không giữ quyền nào" → mảng rỗng từ API, KHÔNG phải 403 — nên trang này
// không có trạng thái "forbidden" thật sự trừ khi gọi API thất bại vì lý do khác (401 hết phiên).
export function ListingReportsQueueView() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
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
        return listPendingListingReports(session.accessToken);
      })
      .then((items) => {
        if (!cancelled) setState({ kind: 'ready', items });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setState({ kind: 'forbidden' });
        } else {
          setState({ kind: 'error', message: err instanceof ApiError && err.status < 500 ? err.message : 'Đã xảy ra lỗi. Vui lòng thử lại.' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (state.kind === 'forbidden') {
    return (
      <main>
        <h1>Hàng chờ báo cáo</h1>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Cần đăng nhập</p>
          <Link href="/login" className={placeStyles.btn}>
            Đăng nhập
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Hàng chờ báo cáo</h1>
        <p className={placeStyles.pageLede}>
          Báo cáo &quot;báo sai/báo trùng&quot; cho tin tuyển dụng và bất động sản bạn có quyền duyệt.
        </p>
      </header>

      {state.kind === 'loading' && <p aria-busy="true">Đang tải…</p>}

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
          <p>Không có báo cáo nào đang chờ xử lý.</p>
        </div>
      )}

      {state.kind === 'ready' && state.items.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.75rem' }}>
          {state.items.map((report) => (
            <li key={report.id} className={placeStyles.state}>
              <p className={placeStyles.stateTitle}>
                {LISTING_REPORT_REASON_LABELS[report.reason]} — {report.listing ? listingLabel(report.listing) : '(tin không còn khả dụng)'}
              </p>
              {report.description && <p>{report.description}</p>}
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                Gửi ngày {formatDate(report.created_at)} · Loại: {TARGET_TYPE_LABELS[report.target_type]}
              </p>
              <ListingReportDecisionForm report={report} onResolved={reload} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
