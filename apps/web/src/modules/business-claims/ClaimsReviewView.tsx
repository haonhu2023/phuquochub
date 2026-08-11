'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { Pagination } from '@/components/ui/Pagination';
import type { PaginationMeta } from '@phuquochub/shared-types';
import placeStyles from '@/modules/places/places.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';
import { listBusinessClaims } from './api/business-claims.api';
import { claimStatusLabel } from './claimStatusLabels';
import { ClaimsForbiddenState, claimStatusClass, formatClaimDate } from './reviewShared';
import { BUSINESS_CLAIM_STATUSES, type BusinessClaimStatusValue, type ModeratorBusinessClaim } from './types';
import styles from './business-claims.module.css';

const PAGE_SIZE = 20;
const BASE = '/dashboard/business-claims/review';

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; claims: ModeratorBusinessClaim[]; meta: PaginationMeta };

/** Chỉ nhận status thuộc 5 giá trị THẬT — query string tuỳ ý không được truyền thẳng xuống API. */
function parseStatus(raw: string | null): BusinessClaimStatusValue | undefined {
  return raw && (BUSINESS_CLAIM_STATUSES as readonly string[]).includes(raw)
    ? (raw as BusinessClaimStatusValue)
    : undefined;
}

function parsePage(raw: string | null): number | undefined {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}

// Hàng đợi duyệt yêu cầu xác nhận quyền quản lý (GET /business-claims, Business.Verify).
// CÙNG khuôn ModerationQueueView: đọc session -> gọi API xác thực -> signed-out/forbidden/error/
// empty/ready, lọc + phân trang qua query string (link-based, giữ được khi tải lại trang).
//
// Backend mặc định status=pending khi không truyền — mặc định "hàng đợi cần xử lý" đó được giữ
// nguyên ở đây (không ép status vào URL khi người dùng chưa chọn bộ lọc nào).
export function ClaimsReviewView() {
  const searchParams = useSearchParams();
  const spString = searchParams.toString();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    const sp = new URLSearchParams(spString);
    const status = parseStatus(sp.get('status'));
    const page = parsePage(sp.get('page'));
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
        return listBusinessClaims({ status, page, limit: PAGE_SIZE }, session.accessToken);
      })
      .then(({ data, meta }) => {
        if (!cancelled) setState({ kind: 'ready', claims: data, meta });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) {
          setState({ kind: 'forbidden' });
          return;
        }
        const message =
          err instanceof ApiError && err.status < 500
            ? err.message
            : 'Đã xảy ra lỗi khi tải hàng đợi. Vui lòng thử lại.';
        setState({ kind: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, [spString, reloadKey]);

  const currentStatus = parseStatus(searchParams.get('status'));
  // Query string cho Pagination TRỪ `page` — giữ nguyên bộ lọc khi đổi trang.
  const baseQuery = currentStatus ? `status=${currentStatus}` : '';

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Duyệt yêu cầu xác nhận quyền quản lý</h1>
        <p className={placeStyles.pageLede}>
          Hàng đợi yêu cầu chủ cơ sở gửi lên. Duyệt sẽ cấp quyền quản lý cơ sở cho người yêu cầu và
          đánh dấu cơ sở là đã xác minh chính chủ.
        </p>
      </header>

      {/* Backend KHÔNG có lựa chọn "tất cả": thiếu `status` nghĩa là `pending`
          (BusinessClaimsService.list). Vì vậy chỉ render đúng 5 trạng thái thật và coi trạng thái
          mặc định (URL không có `status`) là `pending` đang được chọn — không dựng thêm một mục
          "mặc định" riêng vốn trùng nghĩa với `pending`. */}
      <nav className={styles.filterBar} aria-label="Lọc theo trạng thái">
        {BUSINESS_CLAIM_STATUSES.map((s) => {
          const active = (currentStatus ?? 'pending') === s;
          return (
            <Link
              key={s}
              href={`${BASE}?status=${s}`}
              className={`${styles.filterLink} ${active ? styles.filterLinkActive : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              {claimStatusLabel(s)}
            </Link>
          );
        })}
      </nav>

      {state.kind === 'signed-out' && (
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Cần đăng nhập</p>
          <p>Đăng nhập bằng tài khoản có quyền kiểm duyệt để xem hàng đợi này.</p>
          <Link href={`/login?next=${encodeURIComponent(BASE)}`} className={placeStyles.btn}>
            Đăng nhập
          </Link>
        </div>
      )}

      {state.kind === 'forbidden' && <ClaimsForbiddenState />}

      {state.kind === 'loading' && (
        <div className={placeMgmtStyles.list} aria-busy="true" aria-label="Đang tải hàng đợi">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={placeMgmtStyles.skelRow} />
          ))}
        </div>
      )}

      {state.kind === 'error' && (
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không tải được hàng đợi</p>
          <p>{state.message}</p>
          <button type="button" className={placeStyles.btn} onClick={reload}>
            Thử lại
          </button>
        </div>
      )}

      {state.kind === 'ready' && state.claims.length === 0 && (
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>Không có yêu cầu nào</p>
          <p>
            {currentStatus
              ? `Không có yêu cầu nào ở trạng thái "${claimStatusLabel(currentStatus)}".`
              : 'Hiện không có yêu cầu nào đang chờ xét duyệt.'}
          </p>
        </div>
      )}

      {state.kind === 'ready' && state.claims.length > 0 && (
        <>
          <div className={placeMgmtStyles.list}>
            {state.claims.map((claim) => (
              <div key={claim.id} className={placeMgmtStyles.row}>
                <div className={placeMgmtStyles.rowMain}>
                  <span className={placeMgmtStyles.rowTitle}>{claim.place_name}</span>
                  <div className={placeMgmtStyles.rowMeta}>
                    <span
                      className={`${placeMgmtStyles.statusBadge} ${claimStatusClass(claim.status, placeMgmtStyles)}`}
                    >
                      {claimStatusLabel(claim.status)}
                    </span>
                    <span>Người yêu cầu: {claim.requester_display_name}</span>
                    <span>Gửi {formatClaimDate(claim.created_at)}</span>
                  </div>
                </div>
                <div className={placeMgmtStyles.rowActions}>
                  <Link href={`${BASE}/${claim.id}`} className={placeStyles.btn}>
                    Xem &amp; quyết định
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <Pagination
            page={state.meta.page}
            totalPages={state.meta.totalPages}
            basePath={BASE}
            baseQuery={baseQuery}
          />
        </>
      )}
    </main>
  );
}
