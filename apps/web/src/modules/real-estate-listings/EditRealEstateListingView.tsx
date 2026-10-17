'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { getMyRealEstateListing } from './api/real-estate-listings.api';
import { RealEstateListingForm } from './RealEstateListingForm';
import { RealEstateListingTranslationEditor } from './RealEstateListingTranslationEditor';
import type { RealEstateListingSenderView } from './types';
import { RealEstateListingPhotosManager } from '../real-estate-listing-photos/RealEstateListingPhotosManager';
import placeStyles from '@/modules/places/places.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; listing: RealEstateListingSenderView }
  | { kind: 'saved'; listing: RealEstateListingSenderView };

export function EditRealEstateListingView({ id }: { id: string }) {
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
    void getMyRealEstateListing(id, session.accessToken)
      .then((listing) => {
        if (!cancelled) setState({ kind: 'ready', listing });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError && err.isNotFound
            ? 'Không tìm thấy tin bất động sản, hoặc tin này không thuộc về bạn.'
            : 'Không tải được tin bất động sản. Vui lòng thử lại.';
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
          <h1 className={placeStyles.pageTitle}>Sửa tin bất động sản</h1>
        </header>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không tải được</p>
          <p>{state.message}</p>
          <Link href="/dashboard/real-estate" className={placeStyles.btn}>
            ← Về Tin bất động sản của tôi
          </Link>
        </div>
      </main>
    );
  }

  if (state.kind === 'saved') {
    return (
      <main>
        <header className={placeStyles.pageHeader}>
          <h1 className={placeStyles.pageTitle}>Sửa tin bất động sản</h1>
        </header>
        <div className={placeStyles.state} role="status">
          <p className={placeStyles.stateTitle}>Đã lưu</p>
          <p>Tin &quot;{state.listing.title}&quot; hiện ở trạng thái: {state.listing.status}.</p>
          <div className={placeMgmtStyles.actions} style={{ justifyContent: 'center', marginTop: '1rem' }}>
            <Link href="/dashboard/real-estate" className={placeStyles.btn}>
              Về Tin bất động sản của tôi
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Sửa tin bất động sản</h1>
      </header>
      <RealEstateListingForm existing={state.listing} onSaved={(listing) => setState({ kind: 'saved', listing })} />
      <RealEstateListingTranslationEditor listing={state.listing} />
      <RealEstateListingPhotosManager listingId={state.listing.id} />
    </main>
  );
}
