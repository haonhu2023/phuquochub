'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { listPendingRealEstateListingTranslations } from './api/real-estate-listings.api';
import { RealEstateListingTranslationDecisionForm } from './RealEstateListingTranslationDecisionForm';
import { RealEstateListingTranslationCompare } from './RealEstateListingTranslationCompare';
import type { RealEstateListingTranslationModeratorView } from './types';
import placeStyles from '@/modules/places/places.module.css';

type State =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: RealEstateListingTranslationModeratorView[] };

// Hàng chờ duyệt bản dịch tiếng Anh cho BĐS — cùng khuôn JobListingTranslationModerationQueueView.tsx
// (xem ghi chú đầy đủ ở đó).
export function RealEstateListingTranslationModerationQueueView() {
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
        return listPendingRealEstateListingTranslations(session.accessToken);
      })
      .then((items) => {
        if (!cancelled) setState({ kind: 'ready', items });
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
        <h1>Duyệt bản dịch tiếng Anh — Tin bất động sản</h1>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không có quyền truy cập</p>
          <p>
            Bạn không có quyền <code>RealEstateListing.Moderate</code> để xem trang này.
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
        <h1 className={placeStyles.pageTitle}>Duyệt bản dịch tiếng Anh — Tin bất động sản</h1>
        <p className={placeStyles.pageLede}>
          Khác hàng chờ duyệt tin gốc: đây là các bản dịch tiếng Anh đang chờ duyệt RIÊNG, độc lập với trạng thái
          tiếng Việt của tin.
        </p>
      </header>

      {state.kind === 'loading' && (
        <div aria-busy="true" aria-label="Đang tải hàng chờ">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              style={{ height: '8rem', borderRadius: '0.5rem', background: 'var(--surface-2, #eee)', marginBottom: '0.75rem' }}
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
          <p>Không có bản dịch tiếng Anh nào đang chờ duyệt.</p>
        </div>
      )}

      {state.kind === 'ready' && state.items.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '1rem' }}>
          {state.items.map((t) => (
            <li key={t.id} className={placeStyles.state}>
              <p className={placeStyles.stateTitle}>{t.source_title}</p>
              {t.is_stale && (
                <p style={{ color: 'var(--warning, #b45309)', fontSize: '0.85rem' }}>
                  Dữ kiện tiếng Việt (giá/diện tích/điều kiện…) có thể đã đổi từ sau khi bản dịch này được soạn — kiểm lại trước khi
                  duyệt.
                </p>
              )}
              <RealEstateListingTranslationCompare
                source={{
                  title: t.source_title,
                  description: t.source_description,
                  descriptionRich: t.source_description_rich,
                  utilitiesNote: t.source_utilities_note,
                  utilitiesNoteRich: t.source_utilities_note_rich,
                  legalStatusNote: t.source_legal_status_note,
                  legalStatusNoteRich: t.source_legal_status_note_rich,
                }}
                translation={{
                  title: t.title ?? '',
                  description: t.description ?? '',
                  descriptionRich: t.description_rich,
                  utilitiesNote: t.utilities_note ?? '',
                  legalStatusNote: t.legal_status_note ?? '',
                }}
              />
              <RealEstateListingTranslationDecisionForm translation={t} onDecided={reload} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function safeMessage(err: unknown): string {
  if (err instanceof ApiError && err.status < 500) return err.message;
  return 'Đã xảy ra lỗi khi tải hàng chờ duyệt bản dịch. Vui lòng thử lại.';
}
