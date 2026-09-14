'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import placeStyles from '@/modules/places/places.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';
import { listMyPlaceEditProposals } from './api/place-edit-proposals.api';
import { placeEditProposalStatusLabel } from './proposalStatusLabels';
import { PLACE_EDIT_PROPOSAL_FIELD_LABELS, type MyPlaceEditProposal } from './types';

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; proposals: MyPlaceEditProposal[] };

// "Đề xuất chỉnh sửa của tôi" — CÙNG khuôn MyClaimsView.tsx (business-claims): đọc session, gọi
// GET /place-edit-proposals/mine (tự lọc theo JWT ở backend, KHÔNG có tham số lọc-theo-user nào ở
// client), signed-out/loading/error/empty/ready. Chỉ hiển thị field submitter-safe backend đã trả
// (toMyPlaceEditProposalView() — không có reviewer_id/proposer_id).
export function MyPlaceEditProposalsView() {
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
        return listMyPlaceEditProposals(session.accessToken);
      })
      .then((proposals) => {
        if (!cancelled) setState({ kind: 'ready', proposals });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError && err.status < 500
            ? err.message
            : 'Đã xảy ra lỗi khi tải danh sách đề xuất. Vui lòng thử lại.';
        setState({ kind: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Đề xuất chỉnh sửa của tôi</h1>
        <p className={placeStyles.pageLede}>
          Trạng thái các đề xuất chỉnh sửa địa điểm bạn đã gửi và lý do xử lý (nếu có).
        </p>
      </header>

      {state.kind === 'signed-out' && (
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Cần đăng nhập</p>
          <p>Đăng nhập để xem trạng thái đề xuất chỉnh sửa của bạn.</p>
          <Link href="/login?next=/dashboard/places/edit-proposals/mine" className={placeStyles.btn}>
            Đăng nhập
          </Link>
        </div>
      )}

      {state.kind === 'loading' && (
        <div className={placeMgmtStyles.list} aria-busy="true" aria-label="Đang tải đề xuất của tôi">
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

      {state.kind === 'ready' && state.proposals.length === 0 && (
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>Chưa có đề xuất nào</p>
          <p>Bạn chưa gửi đề xuất chỉnh sửa địa điểm nào.</p>
          <Link href="/places" className={placeStyles.btn}>
            Tìm địa điểm để đề xuất chỉnh sửa
          </Link>
        </div>
      )}

      {state.kind === 'ready' && state.proposals.length > 0 && (
        <div className={placeMgmtStyles.list}>
          {state.proposals.map((proposal) => (
            <ProposalRow key={proposal.id} proposal={proposal} />
          ))}
        </div>
      )}
    </main>
  );
}

function statusBadgeClass(status: MyPlaceEditProposal['status']): string {
  switch (status) {
    case 'approved':
      return placeMgmtStyles.statusPublished;
    case 'rejected':
    case 'conflict':
      return placeMgmtStyles.statusArchived;
    default:
      return placeMgmtStyles.statusPending;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function ProposalRow({ proposal }: { proposal: MyPlaceEditProposal }) {
  return (
    <div className={placeMgmtStyles.row}>
      <div className={placeMgmtStyles.rowMain}>
        <span className={placeMgmtStyles.rowTitle}>
          {proposal.place_name ?? 'Địa điểm không còn tồn tại'}
          {' · '}
          {PLACE_EDIT_PROPOSAL_FIELD_LABELS[proposal.field_key]}
        </span>
        <div className={placeMgmtStyles.rowMeta}>
          <span className={`${placeMgmtStyles.statusBadge} ${statusBadgeClass(proposal.status)}`}>
            {placeEditProposalStatusLabel(proposal.status)}
          </span>
          <span>Gửi {formatDate(proposal.created_at)}</span>
          {proposal.reviewed_at && <span>Xử lý {formatDate(proposal.reviewed_at)}</span>}
        </div>
        <ProposalNextAction proposal={proposal} />
      </div>
      <div className={placeMgmtStyles.rowActions}>
        {proposal.place_slug && (
          <Link href={`/places/${proposal.place_slug}`} className={placeStyles.btn}>
            Xem địa điểm
          </Link>
        )}
      </div>
    </div>
  );
}

// Giải thích ngắn theo trạng thái — CHỈ đọc field backend đã trả (review_note), không tự bịa lý do
// nào khác. `review_note` là lý do chung cho mọi quyết định (reject/needs_changes/conflict/approve),
// không phải riêng cho reject — hiển thị khi có, bất kể trạng thái nào.
function ProposalNextAction({ proposal }: { proposal: MyPlaceEditProposal }) {
  switch (proposal.status) {
    case 'pending':
      return <p className={placeStyles.pageLede}>Đề xuất đang chờ kiểm duyệt viên xem xét.</p>;
    case 'approved':
      return (
        <p className={placeStyles.pageLede}>
          Đề xuất đã được áp dụng lên trang địa điểm.
          {proposal.review_note ? ` ${proposal.review_note}` : ''}
        </p>
      );
    case 'rejected':
      return (
        <p className={placeStyles.pageLede}>
          Đề xuất bị từ chối{proposal.review_note ? `: ${proposal.review_note}` : '.'}
        </p>
      );
    case 'needs_changes':
      return (
        <p className={placeStyles.pageLede}>
          Cần bổ sung thêm thông tin{proposal.review_note ? `: ${proposal.review_note}` : '.'}
        </p>
      );
    case 'conflict':
      return (
        <p className={placeStyles.pageLede}>
          Dữ liệu gốc đã thay đổi kể từ khi bạn gửi đề xuất nên không thể tự động áp dụng
          {proposal.review_note ? `: ${proposal.review_note}` : '.'} Bạn có thể gửi lại đề xuất mới.
        </p>
      );
    default:
      return null;
  }
}
