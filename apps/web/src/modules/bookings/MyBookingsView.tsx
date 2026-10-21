'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { listMyManagedBookings, confirmBooking, cancelBooking } from './api/bookings.api';
import { BOOKING_STATUS_LABELS, type BookingAdminCardResponse } from './types';
import placeStyles from '@/modules/places/places.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; bookings: BookingAdminCardResponse[]; total: number };

function formatDate(iso: string | null): string {
  if (!iso) return 'Chưa rõ';
  return new Date(iso).toLocaleString('vi-VN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function actionErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Bạn không quản lý cơ sở của booking này.';
    if (err.status === 404) return 'Không tìm thấy booking — có thể đã bị huỷ/xoá.';
    if (err.status < 500) return err.message;
  }
  return 'Không thực hiện được thao tác. Vui lòng thử lại.';
}

// "Đặt chỗ của cơ sở tôi" (Giai đoạn 3 — chiến lược data-hub) — danh sách booking của ĐÚNG các cơ
// sở người gọi quản lý (GET /bookings/mine, tự lọc qua business_claims → user_roles scope
// 'managed', KHÔNG có tham số lọc theo cơ sở nào ở phía client). Cùng khuôn MyPlacesView
// (loading/signed-out/error/ready) + MyJobListingsView (act() khoá theo id đang xử lý, tránh bấm
// hai hành động cùng lúc trên cùng một booking).
export function MyBookingsView() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

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
    void Promise.resolve()
      .then(() => {
        if (!cancelled) setState({ kind: 'loading' });
        return listMyManagedBookings(session.accessToken);
      })
      .then(({ data, meta }) => {
        if (!cancelled) setState({ kind: 'ready', bookings: data, total: meta.total });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiError && err.status < 500 ? err.message : 'Đã xảy ra lỗi khi tải danh sách booking. Vui lòng thử lại.';
        setState({ kind: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function act(id: string, action: 'confirm' | 'cancel') {
    const session = readSession();
    if (!session) {
      setActionError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }
    setActingId(id);
    setActionError(null);
    try {
      const fn = action === 'confirm' ? confirmBooking : cancelBooking;
      await fn(id, session.accessToken);
      reload();
    } catch (err) {
      setActionError(actionErrorMessage(err));
    } finally {
      setActingId(null);
    }
  }

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Đặt chỗ của cơ sở tôi</h1>
        <p className={placeStyles.pageLede}>
          Yêu cầu giữ chỗ từ khách — xác nhận hoặc huỷ. Đây là giữ chỗ KHÔNG thanh toán (chưa tích hợp thanh toán thật).
        </p>
      </header>

      {actionError && (
        <p className={placeMgmtStyles.alert} role="alert">
          {actionError}
        </p>
      )}

      {state.kind === 'signed-out' && (
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Cần đăng nhập</p>
          <p>Đăng nhập để xem và xử lý booking của cơ sở bạn quản lý.</p>
          <Link href="/login?next=/dashboard/bookings" className={placeStyles.btn}>
            Đăng nhập
          </Link>
        </div>
      )}

      {state.kind === 'loading' && (
        <div aria-busy="true" aria-label="Đang tải danh sách booking">
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

      {state.kind === 'ready' && state.bookings.length === 0 && (
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>Chưa có booking nào</p>
          <p>
            Bạn chưa quản lý cơ sở nào có booking, hoặc chưa có yêu cầu đặt chỗ nào. Cần xác nhận
            quyền quản lý cơ sở (business claim đã duyệt) để thấy booking ở đây.
          </p>
        </div>
      )}

      {state.kind === 'ready' && state.bookings.length > 0 && (
        <>
          {state.total > state.bookings.length && (
            <p className={placeMgmtStyles.fieldHint}>
              Hiển thị {state.bookings.length}/{state.total} booking gần nhất.
            </p>
          )}
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.75rem' }}>
            {state.bookings.map((b) => (
              <li key={b.id} className={placeStyles.state}>
                <p className={placeStyles.stateTitle}>
                  {b.booking_code} — {BOOKING_STATUS_LABELS[b.booking_status]}
                </p>
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                  {b.party_size} người · Ngày dịch vụ: {formatDate(b.service_start_at)} · Tạo lúc {formatDate(b.created_at)}
                </p>
                {b.booking_status === 'pending' && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      className={placeMgmtStyles.submitBtn}
                      disabled={actingId === b.id}
                      onClick={() => act(b.id, 'confirm')}
                    >
                      {actingId === b.id ? 'Đang xử lý...' : 'Xác nhận'}
                    </button>
                    <button
                      type="button"
                      className={placeStyles.btn}
                      disabled={actingId === b.id}
                      onClick={() => act(b.id, 'cancel')}
                    >
                      Huỷ
                    </button>
                  </div>
                )}
                {b.booking_status === 'confirmed' && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      className={placeStyles.btn}
                      disabled={actingId === b.id}
                      onClick={() => act(b.id, 'cancel')}
                    >
                      {actingId === b.id ? 'Đang xử lý...' : 'Huỷ'}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
