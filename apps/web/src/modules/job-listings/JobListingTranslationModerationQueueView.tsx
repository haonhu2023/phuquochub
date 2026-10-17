'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { listPendingJobListingTranslations } from './api/job-listings.api';
import { JobListingTranslationDecisionForm } from './JobListingTranslationDecisionForm';
import { JobListingTranslationCompare } from './JobListingTranslationCompare';
import type { JobListingTranslationModeratorView } from './types';
import placeStyles from '@/modules/places/places.module.css';

type State =
  | { kind: 'loading' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; items: JobListingTranslationModeratorView[] };

// Hàng chờ duyệt bản dịch tiếng Anh — CÙNG khuôn JobListingModerationQueueView.tsx (hàng chờ tin
// gốc) nhưng là một hàng đợi RIÊNG (translation.status, không phải job.status). Hiện bản
// nguồn/bản dịch CẠNH NHAU (JobListingTranslationCompare, dùng chung với JobListingTranslationEditor's
// "xem trước" — owner yêu cầu rõ "theo bố cục dễ đối chiếu trên mobile", một component, không hai).
export function JobListingTranslationModerationQueueView() {
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
        return listPendingJobListingTranslations(session.accessToken);
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
        <h1>Duyệt bản dịch tiếng Anh — Tin tuyển dụng</h1>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không có quyền truy cập</p>
          <p>
            Bạn không có quyền <code>JobListing.Moderate</code> để xem trang này.
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
        <h1 className={placeStyles.pageTitle}>Duyệt bản dịch tiếng Anh — Tin tuyển dụng</h1>
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
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{t.source_employer_name}</p>
              {t.is_stale && (
                <p style={{ color: 'var(--warning, #b45309)', fontSize: '0.85rem' }}>
                  Dữ kiện tiếng Việt (lương/ca làm/nơi làm…) có thể đã đổi từ sau khi bản dịch này được soạn — kiểm lại trước khi
                  duyệt.
                </p>
              )}
              <JobListingTranslationCompare
                source={{ title: t.source_title, description: t.source_description, requirements: t.source_requirements, benefits: t.source_benefits }}
                translation={{ title: t.title ?? '', description: t.description ?? '', requirements: t.requirements ?? '', benefits: t.benefits ?? '' }}
              />
              <JobListingTranslationDecisionForm translation={t} onDecided={reload} />
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
