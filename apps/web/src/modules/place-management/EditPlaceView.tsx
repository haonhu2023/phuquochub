'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import placeStyles from '@/modules/places/places.module.css';
import { PlaceForm } from './PlaceForm';
import { listMyPlaces, updatePlace } from './api/place-management.api';
import type { ManagedPlace, PlaceFormInput } from './types';

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; place: ManagedPlace };

interface Props {
  placeId: string;
}

// Sửa địa điểm (PATCH /places/:id, Place.Edit.Managed). KHÔNG có route GET /places/:id đặc quyền
// (chỉ có GET /places/:slug công khai, giới hạn `published`) — nên dữ liệu điền sẵn form lấy từ
// CHÍNH danh sách GET /places/mine đã tải cho trang "Địa điểm của tôi", lọc theo `placeId`. Đây
// là ranh giới an toàn: `id` không tìm thấy trong tập ĐÃ ĐƯỢC BACKEND TỰ LỌC theo quyền của người
// gọi ⇒ hiển thị "không tìm thấy", không phân biệt "không tồn tại" với "không phải của bạn" (không
// có gì để lộ thêm ở hai trường hợp đó).
export function EditPlaceView({ placeId }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });

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
    listMyPlaces(session.accessToken)
      .then((places) => {
        if (cancelled) return;
        const place = places.find((p) => p.id === placeId);
        setState(place ? { kind: 'ready', place } : { kind: 'not-found' });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiError && err.status < 500 ? err.message : 'Đã xảy ra lỗi khi tải địa điểm. Vui lòng thử lại.';
        setState({ kind: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  async function handleSubmit(input: PlaceFormInput): Promise<void> {
    const session = readSession();
    if (!session) {
      throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }
    await updatePlace(placeId, input, session.accessToken);
  }

  if (state.kind === 'signed-out') {
    return (
      <main>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Cần đăng nhập</p>
          <p>Đăng nhập để sửa địa điểm.</p>
          <Link href={`/login?next=/dashboard/places/${placeId}/edit`} className={placeStyles.btn}>
            Đăng nhập
          </Link>
        </div>
      </main>
    );
  }

  if (state.kind === 'loading') {
    return (
      <main aria-busy="true">
        <p style={{ color: 'var(--muted)' }}>Đang tải địa điểm…</p>
      </main>
    );
  }

  if (state.kind === 'not-found') {
    return (
      <main>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không tìm thấy địa điểm</p>
          <p>Địa điểm này không tồn tại, hoặc bạn không có quyền quản lý nó.</p>
          <Link href="/dashboard/places" className={placeStyles.btn}>
            ← Về Địa điểm của tôi
          </Link>
        </div>
      </main>
    );
  }

  if (state.kind === 'error') {
    return (
      <main>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không tải được địa điểm</p>
          <p>{state.message}</p>
          <Link href="/dashboard/places" className={placeStyles.btn}>
            ← Về Địa điểm của tôi
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Sửa: {state.place.name}</h1>
        <p style={{ marginTop: '0.5rem' }}>
          <Link href={`/dashboard/places/${placeId}/managers`} style={{ color: 'var(--accent)' }}>
            Quản lý người quản lý →
          </Link>
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          <Link href={`/dashboard/places/${placeId}/contacts`} style={{ color: 'var(--accent)' }}>
            Quản lý liên hệ →
          </Link>
        </p>
      </header>
      <PlaceForm
        initial={state.place}
        submitLabel="Lưu thay đổi"
        submittingLabel="Đang lưu…"
        onSubmit={handleSubmit}
        cancelHref="/dashboard/places"
      />
    </main>
  );
}
