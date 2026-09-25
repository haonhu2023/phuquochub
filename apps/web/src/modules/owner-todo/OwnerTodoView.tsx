'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { listPendingOwnerDecisions, resolvePlaceNames } from './api/owner-todo.api';
import { QUESTION_TYPE_LABELS, type OwnerTodoRow } from './types';
import placeStyles from '@/modules/places/places.module.css';

// Trần cứng của API (ListDecisionsQueryDto: @Max(200) — owner-decision-queue.controller.ts). Lấy
// đúng trần thay vì mặc định 50 của endpoint: trang này là danh sách VIỆC CẦN LÀM, im lặng bỏ sót
// hơn 50 item đang chờ (hoàn toàn có thể xảy ra khi pipeline nguồn-trước-owner tạo hàng loạt câu
// hỏi cho một đợt mở rộng địa điểm) là một khoảng trống thật, không phải hoàn thiện UX.
const QUEUE_LIMIT = 200;

type State =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; rows: OwnerTodoRow[]; hasMore: boolean; loadingMore: boolean; loadMoreError: string | null };

async function fetchPage(accessToken: string, offset: number): Promise<OwnerTodoRow[]> {
  const items = await listPendingOwnerDecisions(accessToken, { limit: QUEUE_LIMIT, offset });
  const names = await resolvePlaceNames(
    items.map((i) => i.placeId),
    accessToken,
  );
  return items.map((item) => {
    const place = item.placeId ? names.get(item.placeId) : undefined;
    return { ...item, placeName: place?.name ?? null, placeSlug: place?.slug ?? null };
  });
}

export function OwnerTodoView() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

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
        return fetchPage(session.accessToken, 0);
      })
      .then((rows) => {
        if (cancelled) return;
        setState({ kind: 'ready', rows, hasMore: rows.length >= QUEUE_LIMIT, loadingMore: false, loadMoreError: null });
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

  // "Tải thêm" (rà soát Gói A, 2026-09-25) — API GET /owner-decisions hỗ trợ offset/skip thật
  // (owner-decision-queue.repository.ts's findAll: `skip: offset`), trước đây trang này chỉ đọc
  // trang đầu (200) rồi báo "có thể còn" mà không có cách nào owner tự lấy phần còn lại. Chỉ nối
  // thêm rows mới vào rows đã có — không tải lại/ghép trùng phần đầu, không resolve lại tên các
  // place đã biết.
  const loadMore = useCallback(() => {
    const session = readSession();
    if (!session || state.kind !== 'ready' || state.loadingMore || !state.hasMore) return;
    const offset = state.rows.length;
    setState({ ...state, loadingMore: true, loadMoreError: null });
    void fetchPage(session.accessToken, offset)
      .then((newRows) => {
        setState((prev) => {
          if (prev.kind !== 'ready') return prev;
          return {
            kind: 'ready',
            rows: [...prev.rows, ...newRows],
            hasMore: newRows.length >= QUEUE_LIMIT,
            loadingMore: false,
            loadMoreError: null,
          };
        });
      })
      .catch((err: unknown) => {
        setState((prev) =>
          prev.kind === 'ready' ? { ...prev, loadingMore: false, loadMoreError: safeMessage(err) } : prev,
        );
      });
  }, [state]);

  if (state.kind === 'forbidden') {
    return (
      <main>
        <h1>Việc cần làm</h1>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không có quyền truy cập</p>
          <p>
            Bạn không có quyền <code>Place.Approve</code> để xem trang này. Nếu cho rằng đây là
            nhầm lẫn, liên hệ quản trị viên.
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
        <h1 className={placeStyles.pageTitle}>Việc cần làm</h1>
        <p className={placeStyles.pageLede}>
          Các câu hỏi dữ liệu đang chờ quyết định — nguồn không khớp, thiếu nguồn đáng tin cậy,
          hoặc cần chọn nguồn chính. Đây là một phần của hàng chờ, chưa phải toàn bộ: ảnh đang chờ
          duyệt xem ở{' '}
          <Link href="/dashboard/moderation" style={{ color: 'var(--accent)' }}>
            Hàng chờ kiểm duyệt
          </Link>
          , đề xuất chỉnh sửa từ người dùng xem ở{' '}
          <Link href="/dashboard/edit-proposals" style={{ color: 'var(--accent)' }}>
            Duyệt đề xuất chỉnh sửa
          </Link>
          .
        </p>
      </header>

      {state.kind === 'loading' && (
        <div aria-busy="true" aria-label="Đang tải việc cần làm">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{ height: '4rem', borderRadius: '0.5rem', background: 'var(--surface-2, #eee)', marginBottom: '0.75rem' }}
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

      {state.kind === 'ready' && state.rows.length === 0 && (
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>Không có việc nào đang chờ</p>
          <p>Mọi câu hỏi dữ liệu đã được xử lý.</p>
        </div>
      )}

      {state.kind === 'ready' && state.rows.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.75rem' }}>
          {state.rows.map((row) => (
            <li key={row.id} className={placeStyles.state}>
              <p className={placeStyles.stateTitle}>{QUESTION_TYPE_LABELS[row.questionType]}</p>
              <p>
                {row.placeName ? (
                  <>
                    Địa điểm: <strong>{row.placeName}</strong>
                  </>
                ) : row.placeId ? (
                  'Địa điểm: (không tải được tên)'
                ) : row.candidateKey ? (
                  <>Chưa gắn với địa điểm đã tạo — candidate: <code>{row.candidateKey}</code></>
                ) : (
                  'Chưa gắn với địa điểm đã tạo (candidate)'
                )}
                {row.field && <> — trường: <code>{row.field}</code></>}
              </p>
              {row.conflictSummary && <p>{row.conflictSummary}</p>}
              {row.recommendation && (
                <p>
                  <em>Đề xuất: {row.recommendation}</em>
                </p>
              )}
              {row.placeId && (
                <p>
                  <Link href={`/dashboard/places/${row.placeId}/edit`} className={placeStyles.btn}>
                    Sửa địa điểm →
                  </Link>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {state.kind === 'ready' && state.hasMore && (
        <div style={{ marginTop: '1rem' }}>
          {state.loadMoreError && (
            <p role="alert" style={{ marginBottom: '0.5rem' }}>
              {state.loadMoreError}
            </p>
          )}
          <button type="button" className={placeStyles.btn} onClick={loadMore} disabled={state.loadingMore}>
            {state.loadingMore ? 'Đang tải thêm…' : 'Tải thêm'}
          </button>
        </div>
      )}
    </main>
  );
}

function safeMessage(err: unknown): string {
  if (err instanceof ApiError && err.status < 500) return err.message;
  return 'Đã xảy ra lỗi khi tải danh sách việc cần làm. Vui lòng thử lại.';
}
