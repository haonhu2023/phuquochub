'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import placeStyles from '@/modules/places/places.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';
import { listMyBusinessClaims } from './api/business-claims.api';
import { claimReasonCodeLabel, claimStatusLabel } from './claimStatusLabels';
import type { OwnBusinessClaim } from './types';

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; claims: OwnBusinessClaim[] };

// "Yêu cầu xác nhận quyền quản lý của tôi" — danh sách business_claims CỦA CHÍNH người dùng hiện
// tại (GET /business-claims/mine, tự lọc theo requesterId từ JWT — KHÔNG có tham số lọc theo user
// nào ở phía client). CÙNG khuôn MyPlacesView (place-management): đọc session, gọi API xác thực,
// signed-out/error/empty/ready. Chỉ hiển thị field requester-safe backend trả về — không có
// evidence/reviewer_id/decision_note nào ở đây để hiển thị (xem business.mapper.ts).
export function MyClaimsView() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    const session = readSession();
    let cancelled = false;
    if (!session) {
      void Promise.resolve().then(() => {
        if (!cancelled) setState({ kind: 'signed-out' });
      });
      return () => {
        cancelled = true;
      };
    }
    void Promise.resolve()
      .then(() => {
        if (!cancelled) setState({ kind: 'loading' });
        return listMyBusinessClaims(session.accessToken);
      })
      .then((claims) => {
        if (!cancelled) setState({ kind: 'ready', claims });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError && err.status < 500
            ? err.message
            : 'Đã xảy ra lỗi khi tải danh sách yêu cầu. Vui lòng thử lại.';
        setState({ kind: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Yêu cầu xác nhận quyền quản lý</h1>
        <p className={placeStyles.pageLede}>
          Trạng thái các yêu cầu xác nhận quyền quản lý cơ sở bạn đã gửi.
        </p>
      </header>

      {state.kind === 'signed-out' && (
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Cần đăng nhập</p>
          <p>Đăng nhập để xem trạng thái yêu cầu xác nhận quyền quản lý của bạn.</p>
          <Link href="/login?next=/dashboard/business-claims" className={placeStyles.btn}>
            Đăng nhập
          </Link>
        </div>
      )}

      {state.kind === 'loading' && (
        <div className={placeMgmtStyles.list} aria-busy="true" aria-label="Đang tải yêu cầu của tôi">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={placeMgmtStyles.skelRow} />
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

      {state.kind === 'ready' && state.claims.length === 0 && (
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>Chưa có yêu cầu nào</p>
          <p>Bạn chưa gửi yêu cầu xác nhận quyền quản lý cơ sở nào.</p>
          <Link href="/places" className={placeStyles.btn}>
            Tìm địa điểm để xác nhận quyền quản lý
          </Link>
        </div>
      )}

      {state.kind === 'ready' && state.claims.length > 0 && (
        <div className={placeMgmtStyles.list}>
          {state.claims.map((claim) => (
            <ClaimRow key={claim.id} claim={claim} />
          ))}
        </div>
      )}
    </main>
  );
}

function statusBadgeClass(status: OwnBusinessClaim['status']): string {
  switch (status) {
    case 'approved':
      return placeMgmtStyles.statusPublished;
    case 'rejected':
    case 'disputed':
      return placeMgmtStyles.statusArchived;
    default:
      return placeMgmtStyles.statusPending;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function ClaimRow({ claim }: { claim: OwnBusinessClaim }) {
  return (
    <div className={placeMgmtStyles.row}>
      <div className={placeMgmtStyles.rowMain}>
        <span className={placeMgmtStyles.rowTitle}>{claim.place_name}</span>
        <div className={placeMgmtStyles.rowMeta}>
          <span className={`${placeMgmtStyles.statusBadge} ${statusBadgeClass(claim.status)}`}>
            {claimStatusLabel(claim.status)}
          </span>
          <span>Gửi {formatDate(claim.created_at)}</span>
          {claim.decided_at && <span>Quyết định {formatDate(claim.decided_at)}</span>}
        </div>
        <ClaimNextAction claim={claim} />
      </div>
      <div className={placeMgmtStyles.rowActions}>
        {claim.status === 'approved' && (
          <Link href={`/dashboard/places/${claim.place_id}/edit`} className={placeStyles.btn}>
            Quản lý địa điểm
          </Link>
        )}
        {(claim.status === 'rejected' || claim.status === 'withdrawn') && (
          <Link
            href={`/dashboard/business-claims/new?place_id=${encodeURIComponent(claim.place_id)}&place_name=${encodeURIComponent(claim.place_name)}`}
            className={placeStyles.btn}
          >
            Gửi lại yêu cầu
          </Link>
        )}
      </div>
    </div>
  );
}

// Giải thích ngắn theo trạng thái — KHÔNG bao giờ đọc field nào ngoài những gì backend đã trả
// (reason_code, không phải decision_note — xem business.mapper.ts lý do decision_note bị loại).
function ClaimNextAction({ claim }: { claim: OwnBusinessClaim }) {
  switch (claim.status) {
    case 'pending':
      return <p className={placeStyles.pageLede}>Yêu cầu đang chờ kiểm duyệt viên xem xét.</p>;
    case 'approved':
      return (
        <p className={placeStyles.pageLede}>
          Yêu cầu đã được duyệt — bạn có thể chỉnh sửa thông tin địa điểm này.
        </p>
      );
    case 'rejected':
      return (
        <p className={placeStyles.pageLede}>
          Yêu cầu bị từ chối
          {claim.reason_code ? `: ${claimReasonCodeLabel(claim.reason_code)}` : '.'} Bạn có thể gửi lại
          yêu cầu mới kèm bằng chứng đầy đủ hơn.
        </p>
      );
    case 'disputed':
      return (
        <p className={placeStyles.pageLede}>
          Địa điểm này đang có tranh chấp quyền quản lý — quản trị viên đang phân xử, chưa cần bạn
          thao tác gì thêm.
        </p>
      );
    case 'withdrawn':
      return <p className={placeStyles.pageLede}>Bạn đã rút yêu cầu này. Có thể gửi lại bất cứ lúc nào.</p>;
    default:
      return null;
  }
}
