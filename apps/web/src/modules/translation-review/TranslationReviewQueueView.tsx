'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { listReviewQueue } from './api/translation-review.api';
import { TranslationReviewFilters } from './TranslationReviewFilters';
import { TranslationReviewCard } from './TranslationReviewCard';
import type { ListReviewQueueParams, TranslationReviewQueueItem } from './types';
import modStyles from '../moderation/moderation.module.css';
import placeStyles from '@/modules/places/places.module.css';

const PAGE_SIZE = 50;

type State =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      items: TranslationReviewQueueItem[];
      nextCursor: string | null;
      loadingMore: boolean;
      loadMoreError: string | null;
    };

function parseParams(sp: URLSearchParams): Omit<ListReviewQueueParams, 'cursor'> {
  const params: Omit<ListReviewQueueParams, 'cursor'> = { limit: PAGE_SIZE };
  const placeSlug = sp.get('placeSlug');
  if (placeSlug) params.placeSlug = placeSlug;
  const localeCode = sp.get('localeCode');
  if (localeCode) params.localeCode = localeCode;
  const fieldKey = sp.get('fieldKey');
  if (fieldKey) params.fieldKey = fieldKey;
  return params;
}

// Hàng chờ duyệt bản dịch (human-translation-review, 2026-09-04) — cùng khung state/fetch với
// ModerationQueueView.tsx: 403 -> ForbiddenState (ai KHÔNG giữ PlaceTranslation.Review.Any vẫn có
// thể vào route này qua URL trực tiếp — dashboard chỉ ẩn LIÊN KẾT, không phải route; BE mới là nơi
// chặn thật, xem capabilities.ts).
//
// Phân trang keyset (2026-09-04 scale-up): "Tải thêm" nối thêm một trang vào danh sách đã có, KHÔNG
// thay thế nó — khớp quy ước Pagination.tsx hiện có của repo là điều hướng trang (không phải
// infinite scroll), nhưng "Tải thêm" phù hợp hơn cho một hàng chờ công việc đang xử lý dần (owner
// duyệt xong vài mục rồi mới cần xem thêm), tránh mất vị trí cuộn mỗi khi nạp trang mới. Đổi bộ lọc
// hoặc một quyết định vừa xảy ra (reload) luôn NẠP LẠI TỪ ĐẦU (bỏ cursor), không nối tiếp — dữ liệu
// cũ có thể không còn đúng bộ lọc/trạng thái nữa.
export function TranslationReviewQueueView() {
  const searchParams = useSearchParams();
  const spString = searchParams.toString();
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
        return listReviewQueue(parseParams(new URLSearchParams(spString)), session.accessToken);
      })
      .then((page) => {
        if (!cancelled) {
          setState({ kind: 'ready', items: page.rows, nextCursor: page.nextCursor, loadingMore: false, loadMoreError: null });
        }
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
  }, [spString, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const loadMore = useCallback(() => {
    setState((prev) => {
      if (prev.kind !== 'ready' || !prev.nextCursor || prev.loadingMore) return prev;
      const session = readSession();
      if (!session) return prev; // phiên hết hạn giữa chừng — nút Duyệt của từng dòng sẽ tự báo lỗi

      const cursor = prev.nextCursor;
      void listReviewQueue({ ...parseParams(new URLSearchParams(spString)), cursor }, session.accessToken)
        .then((page) => {
          setState((cur) =>
            cur.kind === 'ready'
              ? { kind: 'ready', items: [...cur.items, ...page.rows], nextCursor: page.nextCursor, loadingMore: false, loadMoreError: null }
              : cur,
          );
        })
        .catch((err: unknown) => {
          setState((cur) => (cur.kind === 'ready' ? { ...cur, loadingMore: false, loadMoreError: safeMessage(err) } : cur));
        });

      return { ...prev, loadingMore: true, loadMoreError: null };
    });
  }, [spString]);

  if (state.kind === 'forbidden') {
    return (
      <main>
        <h1>Duyệt bản dịch</h1>
        <ForbiddenState />
      </main>
    );
  }

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Duyệt bản dịch</h1>
        <p className={placeStyles.pageLede}>
          Mỗi bản dịch chỉ trở thành công khai sau khi một người thật, có quyền, xem qua nội dung và
          nguồn rồi bấm Duyệt — không có cách nào khác để một bản dịch trở nên công khai.
        </p>
      </header>

      <TranslationReviewFilters total={state.kind === 'ready' ? state.items.length : 0} />

      {state.kind === 'loading' && (
        <div className={modStyles.queue} aria-busy="true" aria-label="Đang tải hàng chờ">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={modStyles.skelRow} />
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
          <p>Không có bản dịch nào đang chờ duyệt khớp bộ lọc hiện tại.</p>
        </div>
      )}

      {state.kind === 'ready' && state.items.length > 0 && (
        <>
          <div className={modStyles.queue}>
            {state.items.map((item) => (
              <TranslationReviewCard key={item.id} item={item} onDecided={reload} />
            ))}
          </div>

          {state.loadMoreError && (
            <p className={modStyles.alert} role="alert">
              {state.loadMoreError}
            </p>
          )}

          {state.nextCursor && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <button type="button" className={placeStyles.btn} onClick={loadMore} disabled={state.loadingMore}>
                {state.loadingMore ? 'Đang tải…' : 'Tải thêm'}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function ForbiddenState() {
  return (
    <div className={placeStyles.state} role="alert">
      <p className={placeStyles.stateTitle}>Không có quyền truy cập</p>
      <p>
        Bạn không có quyền <code>PlaceTranslation.Review.Any</code> để xem hàng chờ duyệt bản dịch.
        Nếu cho rằng đây là nhầm lẫn, liên hệ quản trị viên.
      </p>
      <Link href="/dashboard" className={placeStyles.btn}>
        ← Về bảng điều khiển
      </Link>
    </div>
  );
}

function safeMessage(err: unknown): string {
  if (err instanceof ApiError && err.status < 500) return err.message;
  return 'Đã xảy ra lỗi khi tải hàng chờ duyệt bản dịch. Vui lòng thử lại.';
}
