'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { formatPriceRange } from '@/modules/places/format';
import { getOpeningWeek } from '@/modules/places/openingHours';
import placeStyles from '@/modules/places/places.module.css';
import { previewPlace } from './api/place-management.api';
import { placeStatusClassKey, placeStatusLabel } from './statusLabels';
import type { ManagedPlace } from './types';
import styles from './place-management.module.css';

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; place: ManagedPlace };

interface Props {
  placeId: string;
}

// Xem trước riêng tư (P3, 2026-09-22) — nội dung ĐÚNG những gì trang công khai `/places/:slug` sẽ
// hiện ra khi place này được xuất bản, đọc qua `GET /places/:id/preview` (privileged, cùng
// permission PATCH đã dùng — xem places.service.ts preview()). KHÔNG có URL công khai nào lộ ra:
// route dashboard này được RouteGuard bảo vệ (yêu cầu đăng nhập), và bản thân API preview() 401/404
// cho khách — không có gì để lộ ra ngoài trang này.
//
// Hiển thị các trường vô hướng (tên/mô tả/địa chỉ/giá/giờ mở cửa) — KHÔNG bao gồm contacts/prices/
// media/faqs (những mảng đó là quan hệ vệ tinh mà ManagedPlace không mang, xem types.ts). Ảnh xem
// ở "Quản lý ảnh", liên hệ xem ở "Quản lý liên hệ" — preview này tập trung vào nội dung PlaceForm
// vừa sửa, không phải một bản dựng lại y hệt component trang công khai.
export function PlacePreviewView({ placeId }: Props) {
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
    previewPlace(placeId, session.accessToken)
      .then((place) => {
        if (!cancelled) setState({ kind: 'ready', place });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
          setState({ kind: 'not-found' });
          return;
        }
        const message = err instanceof ApiError && err.status < 500 ? err.message : 'Đã xảy ra lỗi khi tải địa điểm. Vui lòng thử lại.';
        setState({ kind: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  if (state.kind === 'signed-out') {
    return (
      <main>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Cần đăng nhập</p>
          <Link href={`/login?next=/dashboard/places/${placeId}/preview`} className={placeStyles.btn}>
            Đăng nhập
          </Link>
        </div>
      </main>
    );
  }

  if (state.kind === 'loading') {
    return (
      <main aria-busy="true">
        <p style={{ color: 'var(--muted)' }}>Đang tải xem trước…</p>
      </main>
    );
  }

  if (state.kind === 'not-found') {
    return (
      <main>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không tìm thấy địa điểm</p>
          <p>Địa điểm này không tồn tại, hoặc bạn không có quyền xem trước nó.</p>
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
        </div>
      </main>
    );
  }

  const { place } = state;
  const priceLabel = formatPriceRange(place.price_range);
  const openingWeek = getOpeningWeek(place.opening_hours);

  return (
    <main>
      <p style={{ color: 'var(--muted)', marginBottom: '0.5rem' }} role="note">
        Chế độ xem trước riêng tư — chỉ bạn thấy trang này. Nội dung dưới đây là những gì khách sẽ
        thấy sau khi bạn xuất bản.
      </p>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>{place.name}</h1>
        <span className={`${styles.statusBadge} ${styles[placeStatusClassKey(place.status)]}`}>
          {placeStatusLabel(place.status)}
        </span>
      </header>

      <p style={{ marginTop: '1rem' }}>
        <Link href={`/dashboard/places/${placeId}/edit`} className={placeStyles.btn}>
          ← Về trang sửa
        </Link>
      </p>

      {place.short_description && <p style={{ marginTop: '1rem', fontWeight: 600 }}>{place.short_description}</p>}
      {place.description && <p style={{ marginTop: '0.75rem', whiteSpace: 'pre-wrap' }}>{place.description}</p>}

      <section style={{ marginTop: '1.5rem' }}>
        <h2>Thông tin</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {place.address && <li>Địa chỉ: {place.address}</li>}
          {place.ward && <li>Khu vực: {place.ward}</li>}
          {priceLabel && <li>Mức giá: {priceLabel}</li>}
          <li>
            Vị trí: {place.location.lat.toFixed(5)}, {place.location.lng.toFixed(5)}
          </li>
        </ul>
      </section>

      {openingWeek.length > 0 && (
        <section style={{ marginTop: '1.5rem' }}>
          <h2>Giờ mở cửa</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {openingWeek.map((row) => (
              <li key={row.key}>
                {row.label}: {row.hours}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
