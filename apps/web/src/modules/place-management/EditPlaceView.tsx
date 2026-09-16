'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import placeStyles from '@/modules/places/places.module.css';
import { PlaceForm } from './PlaceForm';
import { listMyPlaces, publishPlaceDraft, saveDraftPlace } from './api/place-management.api';
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

  /**
   * BẢNG CHỨC NĂNG — chống ghi đè theo TỪNG trường của PlaceForm (2026-09-16, hoàn tất 2026-09-17).
   * Không phải toàn bộ form đi qua CÙNG một cơ chế; đây là danh sách đầy đủ, không giấu trường nào:
   *
   * | Trường                                          | Bảo vệ ghi đè (CAS) | Cơ chế                                  |
   * |--------------------------------------------------|----------------------|-------------------------------------------|
   * | category_id/ward/address/price_range/            | CÓ — 409 nếu bị trôi | saveDraftPlace() -> publishPlaceDraft()    |
   * | opening_hours/location                            | (xmin, không phải    | (PlacesService.saveDraft/publishDraft —    |
   * |                                                    | timestamp)           | location tham gia từ 2026-09-17)           |
   * | name / short_description / description            | KHÔNG qua form này   | CHẶN nếu đổi ở đây — dùng nút ✏️ trên trang |
   * |                                                    | (route riêng có CAS  | (PlaceDescriptionEditor, mở rộng cả ba     |
   * |                                                    | thật ở tầng dịch)    | trường, place_translations thật, có xem    |
   * |                                                    |                      | trước + nháp + công khai)                  |
   *
   * KHÔNG còn trường nào ghi qua PATCH không-CAS nữa — `updatePlaceLegacyFields()` (tồn tại tới
   * 2026-09-17) đã bị GỠ vì không còn caller nào cần đường ghi không bảo vệ đó.
   */
  async function handleSubmit(input: PlaceFormInput): Promise<void> {
    const session = readSession();
    if (!session) {
      throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }
    if (state.kind !== 'ready') {
      throw new Error('Không tải được địa điểm hiện tại — tải lại trang và thử lại.');
    }
    if (input.name !== state.place.name || input.short_description !== state.place.short_description || input.description !== state.place.description) {
      throw new Error(
        'Sửa tên/mô tả ngắn/mô tả chi tiết ở đây chưa được bảo vệ khỏi ghi đè — dùng nút ✏️ trên trang địa điểm (có xem trước, lưu nháp, không bị mất khi người khác sửa cùng lúc).',
      );
    }

    try {
      const draft = await saveDraftPlace(
        placeId,
        {
          category_id: input.category_id,
          address: input.address,
          ward: input.ward,
          price_range: input.price_range,
          opening_hours: input.opening_hours,
          location: input.location,
        },
        session.accessToken,
      );
      await publishPlaceDraft(placeId, draft.id, session.accessToken);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        throw new Error('Địa điểm đã được người khác cập nhật — tải lại trang và thử lại.');
      }
      throw err;
    }
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
        <p style={{ marginTop: '0.5rem' }}>
          <Link href={`/dashboard/places/${placeId}/photos`} style={{ color: 'var(--accent)' }}>
            Quản lý ảnh →
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
