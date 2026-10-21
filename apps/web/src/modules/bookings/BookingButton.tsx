'use client';

import { useState, type FormEvent } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { createGuestBooking } from './api/bookings.api';
import type { BookableEntityType, BookingResponse } from './types';
import placeStyles from '@/modules/places/places.module.css';
import uiStyles from '@/components/ui/ui.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';

interface Props {
  entityType: BookableEntityType;
  /** ADR-002 — hotel/restaurant/tour là satellite table của places, CÙNG id. entity_id và place_id
   * luôn bằng nhau khi gọi từ các trang chi tiết công khai này. */
  placeId: string;
}

type State =
  | { kind: 'closed' }
  | { kind: 'open' }
  | { kind: 'submitting' }
  | { kind: 'success'; booking: BookingResponse }
  | { kind: 'error'; message: string };

function submitErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status < 500) return err.message;
  return 'Không gửi được yêu cầu đặt chỗ. Vui lòng thử lại.';
}

// Giai đoạn 3 (chiến lược data-hub) — MVP "giữ chỗ không thanh toán": form TỐI GIẢN (ngày giờ + số
// người + ghi chú), ẩn hẳn khái niệm items/giá khỏi khách (xem bookings.api.ts's
// createGuestBooking()). Yêu cầu đăng nhập — POST /bookings cần accessToken (Booking.Create, cấp
// cho role `member` — bất kỳ ai đã đăng nhập, xem AddBookingManagePermissions). KHÔNG tự xử lý
// trạng thái "đã lưu" dai dẳng — mỗi lần mở lại trang bắt đầu từ nút "Đặt chỗ", cùng triết lý
// SaveButton (trang chi tiết công khai là Server Component, không có phiên để hỏi trước).
export function BookingButton({ entityType, placeId }: Props) {
  const [state, setState] = useState<State>({ kind: 'closed' });
  const [serviceStartAt, setServiceStartAt] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [guestNote, setGuestNote] = useState('');

  if (state.kind === 'success') {
    return (
      <div className={placeStyles.state} role="status">
        <p className={placeStyles.stateTitle}>Đã gửi yêu cầu đặt chỗ</p>
        <p>
          Mã đặt chỗ: <strong>{state.booking.booking_code}</strong> — trạng thái: Chờ xác nhận.
        </p>
        <p className={placeMgmtStyles.fieldHint}>Cơ sở sẽ xác nhận hoặc huỷ yêu cầu này sớm nhất có thể.</p>
      </div>
    );
  }

  if (state.kind === 'closed') {
    return (
      <button type="button" className={placeStyles.btn} onClick={() => setState({ kind: 'open' })}>
        Đặt chỗ
      </button>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const session = readSession();
    if (!session) {
      setState({ kind: 'error', message: 'Đăng nhập để đặt chỗ.' });
      return;
    }
    setState({ kind: 'submitting' });
    try {
      const booking = await createGuestBooking(
        {
          entity_type: entityType,
          entity_id: placeId,
          place_id: placeId,
          service_start_at: serviceStartAt ? new Date(serviceStartAt).toISOString() : undefined,
          party_size: partySize,
          guest_note: guestNote.trim() || undefined,
        },
        session.accessToken,
      );
      setState({ kind: 'success', booking });
    } catch (err) {
      setState({ kind: 'error', message: submitErrorMessage(err) });
    }
  }

  const submitting = state.kind === 'submitting';

  return (
    <form onSubmit={submit} className={placeMgmtStyles.section} style={{ maxWidth: '26rem' }}>
      <p className={placeMgmtStyles.sectionTitle}>Đặt chỗ</p>

      <div className={uiStyles.field}>
        <label className={uiStyles.fieldLabel} htmlFor="booking-service-start">
          Ngày giờ mong muốn (không bắt buộc)
        </label>
        <input
          id="booking-service-start"
          type="datetime-local"
          className={placeMgmtStyles.input}
          value={serviceStartAt}
          onChange={(e) => setServiceStartAt(e.target.value)}
          disabled={submitting}
        />
      </div>

      <div className={uiStyles.field}>
        <label className={uiStyles.fieldLabel} htmlFor="booking-party-size">
          Số người <span className={placeMgmtStyles.requiredMark}>*</span>
        </label>
        <input
          id="booking-party-size"
          type="number"
          min={1}
          max={200}
          className={placeMgmtStyles.input}
          value={partySize}
          onChange={(e) => setPartySize(Number(e.target.value))}
          required
          disabled={submitting}
        />
      </div>

      <div className={uiStyles.field}>
        <label className={uiStyles.fieldLabel} htmlFor="booking-guest-note">
          Ghi chú (không bắt buộc)
        </label>
        <textarea
          id="booking-guest-note"
          className={placeMgmtStyles.textarea}
          value={guestNote}
          onChange={(e) => setGuestNote(e.target.value)}
          maxLength={2000}
          disabled={submitting}
        />
      </div>

      {state.kind === 'error' && (
        <p className={placeMgmtStyles.fieldError} role="alert">
          {state.message}
        </p>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button type="submit" className={placeMgmtStyles.submitBtn} disabled={submitting}>
          {submitting ? 'Đang gửi...' : 'Gửi yêu cầu đặt chỗ'}
        </button>
        <button type="button" className={placeStyles.btn} onClick={() => setState({ kind: 'closed' })} disabled={submitting}>
          Huỷ
        </button>
      </div>
    </form>
  );
}
