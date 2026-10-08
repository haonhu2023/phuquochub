'use client';

import { useCallback, useEffect, useState } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { listMySavedItems, unsaveItem } from './api/saved-items.api';
import type { SavedItemView } from './types';
import { JobListingCard } from '../job-listings/JobListingCard';
import { RealEstateListingCard } from '../real-estate-listings/RealEstateListingCard';
import type { JobListingPublicView } from '../job-listings/types';
import type { RealEstateListingPublicView } from '../real-estate-listings/types';
import placeStyles from '@/modules/places/places.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: SavedItemView[] };

// Tái sử dụng NGUYÊN hai card công khai (JobListingCard/RealEstateListingCard) thay vì tự dựng
// card riêng cho trang này — cùng dữ liệu (JobListingPublicView/RealEstateListingPublicView),
// cùng cách hiển thị giá/trạng thái đã có, không nhân đôi logic định dạng.
export function MySavedItemsView() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [removingId, setRemovingId] = useState<string | null>(null);

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
        return listMySavedItems(session.accessToken);
      })
      .then((items) => {
        if (!cancelled) setState({ kind: 'ready', items });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ kind: 'error', message: safeMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function remove(item: SavedItemView) {
    const session = readSession();
    if (!session) return;
    setRemovingId(item.id);
    try {
      await unsaveItem(item.target_type, item.target_id, session.accessToken);
      reload();
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Tin đã lưu</h1>
        <p className={placeStyles.pageLede}>Tin tuyển dụng và bất động sản bạn đã lưu để xem lại.</p>
      </header>

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
          <p className={placeStyles.stateTitle}>Chưa có tin nào đã lưu</p>
          <p>Bấm &quot;Lưu tin&quot; trên một tin tuyển dụng hoặc bất động sản để xem lại ở đây.</p>
        </div>
      )}

      {state.kind === 'ready' && state.items.length > 0 && (
        <div className={placeStyles.grid}>
          {state.items.map((item) =>
            item.listing ? (
              <div key={item.id} style={{ position: 'relative' }}>
                {item.target_type === 'job_listing' ? (
                  <JobListingCard job={item.listing as JobListingPublicView} />
                ) : (
                  <RealEstateListingCard listing={item.listing as RealEstateListingPublicView} />
                )}
                <div className={placeMgmtStyles.actions} style={{ marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className={placeStyles.btn}
                    disabled={removingId === item.id}
                    onClick={() => remove(item)}
                  >
                    Bỏ lưu
                  </button>
                </div>
              </div>
            ) : (
              <div key={item.id} className={placeStyles.state}>
                <p className={placeStyles.stateTitle}>Tin không còn khả dụng</p>
                <p>Tin này đã bị đóng, hết hạn hoặc gỡ bỏ sau khi bạn lưu.</p>
                <button
                  type="button"
                  className={placeStyles.btn}
                  disabled={removingId === item.id}
                  onClick={() => remove(item)}
                >
                  Bỏ lưu
                </button>
              </div>
            ),
          )}
        </div>
      )}
    </main>
  );
}

function safeMessage(err: unknown): string {
  if (err instanceof ApiError && err.status < 500) return err.message;
  return 'Đã xảy ra lỗi. Vui lòng thử lại.';
}
