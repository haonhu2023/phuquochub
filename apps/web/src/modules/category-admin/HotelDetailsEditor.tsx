'use client';

import { useEffect, useState } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { getHotelDetails, updateHotelDetails, type HotelDetailsAdmin, type UpdateHotelDetailsInput } from '@/modules/hotels/api/hotels.api';
import { HOTEL_TYPE_LABELS, HOTEL_TYPE_VALUES, type HotelType } from '@/modules/hotels/types';
import { createSource } from '@/modules/sources/api/sources.api';
import styles from '@/modules/place-management/place-management.module.css';
import uiStyles from '@/components/ui/ui.module.css';

interface Props {
  placeId: string;
  // CAS thật (2026-09-30) — token `places.content_version` do EditPlaceView (cha) giữ, dùng chung
  // với AmenitiesEditor anh em trên CÙNG place. Đọc trực tiếp từ prop tại thời điểm lưu (KHÔNG copy
  // vào state riêng) để luôn thấy giá trị mới nhất kể cả khi AmenitiesEditor vừa lưu xong.
  contentVersion: number;
  onVersionChange: (v: number) => void;
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; details: HotelDetailsAdmin };

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Nhóm trường riêng của Khách sạn (loại hình/hạng sao có nguồn/giờ nhận-trả phòng) — nhúng vào
 * EditPlaceView (chỉ khi category_slug='hotel'), cùng khuôn PlaceDescriptionEditor: tự tải, tự
 * lưu, không phụ thuộc PlaceForm. PATCH /hotels/:id/details TỪNG PHẦN thật — trường để trống ("Không
 * đổi") không gửi lên (giữ nguyên), KHÔNG BAO GIỜ tự gửi null cho trường người dùng chưa chạm tới.
 */
export function HotelDetailsEditor({ placeId, contentVersion, onVersionChange }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [hotelType, setHotelType] = useState<HotelType>('hotel');
  const [starRating, setStarRating] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [newSourceTitle, setNewSourceTitle] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Trì hoãn qua microtask — setState đồng bộ ngay trong thân effect (nhánh "hết phiên") bị flag
    // bởi react-hooks/set-state-in-effect. Cùng khuôn EditPlaceView.tsx (load qua Promise.resolve().then).
    void Promise.resolve().then(() => {
      const session = readSession();
      if (!session) {
        if (!cancelled) setState({ kind: 'error', message: 'Phiên đăng nhập đã hết hạn — tải lại trang.' });
        return;
      }
      getHotelDetails(placeId, session.accessToken)
        .then((details) => {
          if (cancelled) return;
          setState({ kind: 'ready', details });
          // place_hotel_details CHƯA tồn tại (hotel vừa tạo) → các field detail VẮNG MẶT trong
          // response (không phải `null`) — chỉ prefill khi thật sự có dữ liệu, xem HotelDetails's
          // ghi chú ở hotels.api.ts.
          if (details.hotel_type !== undefined) {
            setHotelType(details.hotel_type);
            setStarRating(details.star_rating != null ? String(details.star_rating) : '');
            setCheckIn(details.check_in?.slice(0, 5) ?? '');
            setCheckOut(details.check_out?.slice(0, 5) ?? '');
          }
        })
        .catch(() => {
          if (!cancelled) setState({ kind: 'error', message: 'Không tải được thông tin khách sạn.' });
        });
    });
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  if (state.kind === 'loading') return <p style={{ color: 'var(--muted)' }}>Đang tải thông tin khách sạn…</p>;
  if (state.kind === 'error') return <p className={styles.alert}>{state.message}</p>;

  const currentSource = state.details.star_rating_source ?? null;

  async function onSave() {
    const session = readSession();
    if (!session) return;
    setError(null);
    setNotice(null);

    if (checkIn && !HH_MM.test(checkIn)) {
      setError('Giờ nhận phòng phải theo định dạng HH:MM (24 giờ).');
      return;
    }
    if (checkOut && !HH_MM.test(checkOut)) {
      setError('Giờ trả phòng phải theo định dạng HH:MM (24 giờ).');
      return;
    }

    setBusy(true);
    try {
      let starRatingSourceId: string | undefined;
      // Chỉ tạo nguồn mới khi người dùng THỰC SỰ nhập gì đó — để trống hai ô này nghĩa là "không
      // đổi nguồn", không phải "xoá nguồn" (xoá là một hành động khác, chưa có UI riêng ở bản này).
      if (newSourceTitle.trim() || newSourceUrl.trim()) {
        const source = await createSource(
          { type: 'official_website', kind: 'url', title: newSourceTitle.trim() || undefined, url: newSourceUrl.trim() || undefined },
          session.accessToken,
        );
        starRatingSourceId = source.id;
      }

      const payload: UpdateHotelDetailsInput = {
        expected_content_version: contentVersion,
        hotel_type: hotelType,
        star_rating: starRating.trim() ? Number(starRating) : null,
        check_in: checkIn.trim() ? checkIn : null,
        check_out: checkOut.trim() ? checkOut : null,
      };
      if (starRatingSourceId) payload.star_rating_source_id = starRatingSourceId;

      const updated = await updateHotelDetails(placeId, payload, session.accessToken);
      setState({ kind: 'ready', details: updated });
      onVersionChange(updated.content_version);
      setNewSourceTitle('');
      setNewSourceUrl('');
      setNotice('Đã lưu thông tin khách sạn.');
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : 'Lưu thất bại. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Thông tin khách sạn" className={styles.contentEditor}>
      <h2>Thông tin khách sạn</h2>
      <div className={styles.fieldGrid}>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Loại hình</span>
          <select className={styles.input} value={hotelType} onChange={(e) => setHotelType(e.target.value as HotelType)}>
            {HOTEL_TYPE_VALUES.map((v) => (
              <option key={v} value={v}>
                {HOTEL_TYPE_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Hạng sao (1–5, để trống = chưa xếp hạng)</span>
          <input
            className={styles.input}
            type="number"
            min={1}
            max={5}
            value={starRating}
            onChange={(e) => setStarRating(e.target.value)}
          />
        </label>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Giờ nhận phòng (HH:MM)</span>
          <input className={styles.input} type="text" placeholder="14:00" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </label>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Giờ trả phòng (HH:MM)</span>
          <input className={styles.input} type="text" placeholder="12:00" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        </label>
      </div>

      <p className={styles.fieldHint} style={{ marginTop: '0.75rem' }}>
        Nguồn hạng sao hiện tại:{' '}
        {currentSource ? (
          currentSource.url ? (
            <a href={currentSource.url} target="_blank" rel="noopener noreferrer">
              {currentSource.title ?? currentSource.url}
            </a>
          ) : (
            currentSource.title ?? '(không có tiêu đề)'
          )
        ) : (
          'Chưa có nguồn'
        )}
      </p>
      <div className={styles.fieldGrid}>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Thêm/cập nhật nguồn — tiêu đề</span>
          <input className={styles.input} type="text" value={newSourceTitle} onChange={(e) => setNewSourceTitle(e.target.value)} placeholder="Vd: Sở Du lịch Kiên Giang" />
        </label>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Thêm/cập nhật nguồn — URL</span>
          <input className={styles.input} type="text" value={newSourceUrl} onChange={(e) => setNewSourceUrl(e.target.value)} placeholder="https://…" />
        </label>
      </div>
      <p className={styles.fieldHint}>
        Đổi hạng sao mà không nhập nguồn mới ở đây sẽ xoá nhãn &ldquo;có nguồn&rdquo; cũ — nguồn cũ chỉ xác minh hạng sao trước đó, không phải hạng sao vừa đổi.
      </p>

      {error && <p className={styles.alert} role="alert">{error}</p>}
      {notice && <p className={styles.success} role="status">{notice}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.submitBtn} onClick={() => void onSave()} disabled={busy}>
          {busy ? 'Đang lưu…' : 'Lưu thông tin khách sạn'}
        </button>
      </div>
    </section>
  );
}
