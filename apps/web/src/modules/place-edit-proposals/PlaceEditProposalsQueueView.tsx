'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { previewPlace } from '@/modules/place-management/api/place-management.api';
import { listPlaceEditProposals } from './api/place-edit-proposals.api';
import { PlaceEditProposalDecisionForm } from './PlaceEditProposalDecisionForm';
import { PLACE_EDIT_PROPOSAL_FIELD_LABELS, PLACE_EDIT_PROPOSAL_STATUS_LABELS, type PlaceEditProposalView } from './types';
import placeStyles from '@/modules/places/places.module.css';

type PlaceLookup = { name: string; slug: string; currentValue: unknown };

type State =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: PlaceEditProposalView[]; places: Map<string, PlaceLookup> };

function formatValue(v: unknown): string {
  if (v == null) return '(trống)';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

// Hàng chờ duyệt "Đề xuất chỉnh sửa" (PlaceEditProposal.Moderate — content_owner giữ trực tiếp, xem
// GrantContentOwnerPlaceEditProposalModeration). API KHÔNG trả giá trị "cũ" (chỉ giữ hash nội bộ để
// phát hiện xung đột, xem place-edit-proposal.mapper.ts) nên trang này tự gọi previewPlace() lấy
// giá trị HIỆN TẠI thật để so sánh — chính xác hơn một snapshot cũ vì phản ánh đúng lúc reviewer
// đang xem, cùng lý do CAS trong decide() đọc lại giá trị sống thay vì tin một bản chụp.
export function PlaceEditProposalsQueueView() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const session = readSession();
    let cancelled = false;
    if (!session) {
      // setState trong callback bất đồng bộ — tránh set-state đồng bộ trong effect (cùng khuôn
      // ModerationQueueView/OwnerTodoView).
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
        return listPlaceEditProposals(session.accessToken, 'pending');
      })
      .then(async (items) => {
        const uniqueIds = [...new Set(items.map((i) => i.place_id))];
        const places = new Map<string, PlaceLookup>();
        await Promise.all(
          uniqueIds.map(async (id) => {
            try {
              const place = await previewPlace(id, session.accessToken);
              // field_key của MỌI đề xuất cho place này có thể khác nhau — lưu cả object place,
              // đọc đúng field lúc render thay vì chốt một field ở đây.
              places.set(id, { name: place.name, slug: place.slug, currentValue: place });
            } catch {
              // Không tải được place (đã xoá, mất quyền) — vẫn hiện đề xuất, chỉ thiếu so sánh.
            }
          }),
        );
        if (!cancelled) setState({ kind: 'ready', items, places });
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
        <h1>Duyệt đề xuất chỉnh sửa</h1>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không có quyền truy cập</p>
          <p>
            Bạn không có quyền <code>PlaceEditProposal.Moderate</code> để xem trang này.
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
        <h1 className={placeStyles.pageTitle}>Duyệt đề xuất chỉnh sửa</h1>
        <p className={placeStyles.pageLede}>
          Người dùng đề xuất giá trị cụ thể cho địa chỉ/mô tả ngắn/giờ mở cửa. Duyệt áp dụng ngay qua
          đúng luồng lưu hiện có (kiểm tra dữ liệu gốc chưa đổi trước khi ghi) — không có bước sửa
          tay riêng.
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
          <p>Không có đề xuất nào đang chờ xử lý.</p>
        </div>
      )}

      {state.kind === 'ready' && state.items.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.75rem' }}>
          {state.items.map((item) => {
            const place = state.places.get(item.place_id);
            const currentValue = place
              ? (place.currentValue as Record<string, unknown>)[item.field_key]
              : undefined;
            return (
              <li key={item.id} className={placeStyles.state}>
                <p className={placeStyles.stateTitle}>
                  {PLACE_EDIT_PROPOSAL_FIELD_LABELS[item.field_key]} — {place?.name ?? '(không tải được tên địa điểm)'}
                  {' · '}
                  {PLACE_EDIT_PROPOSAL_STATUS_LABELS[item.status]}
                </p>
                <p>
                  Hiện tại: <code>{place ? formatValue(currentValue) : '(không tải được)'}</code>
                </p>
                <p>
                  Đề xuất: <code>{formatValue(item.proposed_value)}</code>
                </p>
                <p>Lý do: {item.reason}</p>
                {item.source_url && (
                  <p>
                    Nguồn:{' '}
                    <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                      {item.source_url}
                    </a>
                  </p>
                )}
                <PlaceEditProposalDecisionForm proposal={item} onDecided={reload} />
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
  return 'Đã xảy ra lỗi khi tải hàng chờ đề xuất. Vui lòng thử lại.';
}
