'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { getMyJobListing } from './api/job-listings.api';
import { JobListingForm } from './JobListingForm';
import type { JobListingSenderView } from './types';
import placeStyles from '@/modules/places/places.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; job: JobListingSenderView }
  | { kind: 'saved'; job: JobListingSenderView };

export function EditJobListingView({ id }: { id: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

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
    void getMyJobListing(id, session.accessToken)
      .then((job) => {
        if (!cancelled) setState({ kind: 'ready', job });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError && err.isNotFound
            ? 'Không tìm thấy tin tuyển dụng, hoặc tin này không thuộc về bạn.'
            : 'Không tải được tin tuyển dụng. Vui lòng thử lại.';
        setState({ kind: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.kind === 'loading') {
    return <main aria-busy="true">Đang tải…</main>;
  }

  if (state.kind === 'error') {
    return (
      <main>
        <header className={placeStyles.pageHeader}>
          <h1 className={placeStyles.pageTitle}>Sửa tin tuyển dụng</h1>
        </header>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không tải được</p>
          <p>{state.message}</p>
          <Link href="/dashboard/job-listings" className={placeStyles.btn}>
            ← Về Tin tuyển dụng của tôi
          </Link>
        </div>
      </main>
    );
  }

  if (state.kind === 'saved') {
    return (
      <main>
        <header className={placeStyles.pageHeader}>
          <h1 className={placeStyles.pageTitle}>Sửa tin tuyển dụng</h1>
        </header>
        <div className={placeStyles.state} role="status">
          <p className={placeStyles.stateTitle}>Đã lưu</p>
          <p>Tin &quot;{state.job.title}&quot; hiện ở trạng thái: {state.job.status}.</p>
          <div className={placeMgmtStyles.actions} style={{ justifyContent: 'center', marginTop: '1rem' }}>
            <Link href="/dashboard/job-listings" className={placeStyles.btn}>
              Về Tin tuyển dụng của tôi
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Sửa tin tuyển dụng</h1>
      </header>
      <JobListingForm existing={state.job} onSaved={(job) => setState({ kind: 'saved', job })} />
    </main>
  );
}
