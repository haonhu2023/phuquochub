'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import placeStyles from '@/modules/places/places.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';
import { getBusinessClaim } from './api/business-claims.api';
import { claimReasonCodeLabel, claimStatusLabel } from './claimStatusLabels';
import { ClaimsForbiddenState, claimStatusClass, formatClaimDate } from './reviewShared';
import { ClaimDecisionForm } from './ClaimDecisionForm';
import { EVIDENCE_TYPE_LABELS, type ModeratorBusinessClaimDetail } from './types';
import styles from './business-claims.module.css';

const BASE = '/dashboard/business-claims/review';

interface Props {
  claimId: string;
}

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'forbidden' }
  | { kind: 'notFound' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; claim: ModeratorBusinessClaimDetail };

// Chi tiết một yêu cầu xác nhận quyền quản lý + form quyết định (GET /business-claims/{id} +
// POST /business-claims/{id}/decide, cả hai Business.Verify). Đây là màn hình DUY NHẤT lộ
// `evidence` — business.md §2 "riêng tư, chỉ Moderator"; hàng đợi cố ý không có.
export function ClaimReviewDetail({ claimId }: Props) {
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
        return getBusinessClaim(claimId, session.accessToken);
      })
      .then((claim) => {
        if (!cancelled) setState({ kind: 'ready', claim });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) {
          setState({ kind: 'forbidden' });
          return;
        }
        if (err instanceof ApiError && err.isNotFound) {
          setState({ kind: 'notFound' });
          return;
        }
        const message =
          err instanceof ApiError && err.status < 500
            ? err.message
            : 'Đã xảy ra lỗi khi tải yêu cầu. Vui lòng thử lại.';
        setState({ kind: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, [claimId, reloadKey]);

  if (state.kind === 'signed-out') {
    return (
      <main>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Cần đăng nhập</p>
          <p>Đăng nhập bằng tài khoản có quyền kiểm duyệt để xem yêu cầu này.</p>
          <Link href={`/login?next=${encodeURIComponent(`${BASE}/${claimId}`)}`} className={placeStyles.btn}>
            Đăng nhập
          </Link>
        </div>
      </main>
    );
  }

  if (state.kind === 'forbidden') {
    return (
      <main>
        <ClaimsForbiddenState />
      </main>
    );
  }

  if (state.kind === 'notFound') {
    return (
      <main>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không tìm thấy yêu cầu</p>
          <p>Yêu cầu này không tồn tại hoặc đã bị gỡ.</p>
          <Link href={BASE} className={placeStyles.btn}>
            ← Về hàng đợi
          </Link>
        </div>
      </main>
    );
  }

  if (state.kind === 'error') {
    return (
      <main>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không tải được yêu cầu</p>
          <p>{state.message}</p>
          <button type="button" className={placeStyles.btn} onClick={reload}>
            Thử lại
          </button>
        </div>
      </main>
    );
  }

  if (state.kind === 'loading') {
    return (
      <main aria-busy="true" aria-label="Đang tải yêu cầu">
        <div className={placeMgmtStyles.skelRow} />
      </main>
    );
  }

  const { claim } = state;

  return (
    <main>
      <nav className={placeStyles.breadcrumb} aria-label="Breadcrumb">
        <Link href={BASE}>Duyệt yêu cầu</Link>
        <span className={placeStyles.sep}>/</span>
        <span aria-current="page">{claim.place_name}</span>
      </nav>

      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>{claim.place_name}</h1>
        <p className={placeStyles.pageLede}>
          <span className={`${placeMgmtStyles.statusBadge} ${claimStatusClass(claim.status, placeMgmtStyles)}`}>
            {claimStatusLabel(claim.status)}
          </span>
        </p>
      </header>

      <section className={placeMgmtStyles.section}>
        <h2 className={placeMgmtStyles.sectionTitle}>Thông tin yêu cầu</h2>
        <dl className={placeStyles.infoGrid}>
          <div className={placeStyles.infoItem}>
            <dt className={placeStyles.infoLabel}>Người yêu cầu</dt>
            <dd className={placeStyles.infoValue}>{claim.requester_display_name}</dd>
          </div>
          <div className={placeStyles.infoItem}>
            <dt className={placeStyles.infoLabel}>Cơ sở</dt>
            <dd className={placeStyles.infoValue}>
              <Link href={`/places/${claim.place_slug}`} target="_blank" rel="noopener noreferrer">
                {claim.place_name} ↗
              </Link>
            </dd>
          </div>
          <div className={placeStyles.infoItem}>
            <dt className={placeStyles.infoLabel}>Gửi lúc</dt>
            <dd className={placeStyles.infoValue}>{formatClaimDate(claim.created_at)}</dd>
          </div>
          {claim.decided_at && (
            <div className={placeStyles.infoItem}>
              <dt className={placeStyles.infoLabel}>Quyết định lúc</dt>
              <dd className={placeStyles.infoValue}>{formatClaimDate(claim.decided_at)}</dd>
            </div>
          )}
          {claim.reason_code && (
            <div className={placeStyles.infoItem}>
              <dt className={placeStyles.infoLabel}>Lý do</dt>
              <dd className={placeStyles.infoValue}>{claimReasonCodeLabel(claim.reason_code)}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className={placeMgmtStyles.section}>
        <h2 className={placeMgmtStyles.sectionTitle}>Bằng chứng</h2>
        {claim.evidence.length === 0 ? (
          <p className={styles.reviewMuted}>Yêu cầu này không kèm bằng chứng nào.</p>
        ) : (
          <ul className={styles.evidenceList}>
            {claim.evidence.map((item, i) => (
              <li key={`${item.type}-${i}`} className={styles.evidenceItem}>
                <span className={styles.evidenceItemTitle}>
                  {EVIDENCE_TYPE_LABELS[item.type] ?? item.type}
                </span>
                <span className={styles.evidenceReference}>{item.reference}</span>
                {item.note && <span className={styles.reviewMuted}>{item.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={placeMgmtStyles.section}>
        <h2 className={placeMgmtStyles.sectionTitle}>Quyết định</h2>
        <ClaimDecisionForm claim={claim} onDecided={reload} />
      </section>
    </main>
  );
}
