'use client';

import { useEffect, useState } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import {
  getRestaurantDetails,
  listAllCuisines,
  updateRestaurantDetails,
  type RestaurantCuisine,
} from '@/modules/restaurants/api/restaurants.api';
import styles from '@/modules/place-management/place-management.module.css';
import uiStyles from '@/components/ui/ui.module.css';

interface Props {
  placeId: string;
  // CAS thật (2026-09-30) — xem HotelDetailsEditor.tsx's ghi chú đầy đủ, cùng khuôn.
  contentVersion: number;
  onVersionChange: (v: number) => void;
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; allCuisines: RestaurantCuisine[] };

/**
 * Nhóm trường riêng của Nhà hàng (loại ẩm thực/đặc sản địa phương/chế độ ăn) — nhúng vào
 * EditPlaceView (chỉ khi category_slug='restaurant'). PATCH /restaurants/:id/details TỪNG PHẦN
 * thật; `cuisine_codes` khi gửi thay TOÀN BỘ gán hiện có (không patch từng mã).
 */
export function RestaurantDetailsEditor({ placeId, contentVersion, onVersionChange }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [isLocalSpecialty, setIsLocalSpecialty] = useState(false);
  const [dietaryText, setDietaryText] = useState('');
  const [selectedCuisines, setSelectedCuisines] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Trì hoãn qua microtask — cùng khuôn HotelDetailsEditor.tsx/EditPlaceView.tsx (tránh
    // react-hooks/set-state-in-effect cho setState đồng bộ ở nhánh "hết phiên").
    void Promise.resolve().then(() => {
      const session = readSession();
      if (!session) {
        if (!cancelled) setState({ kind: 'error', message: 'Phiên đăng nhập đã hết hạn — tải lại trang.' });
        return;
      }
      Promise.all([getRestaurantDetails(placeId, session.accessToken), listAllCuisines()])
        .then(([details, allCuisines]) => {
          if (cancelled) return;
          setState({ kind: 'ready', allCuisines });
          // place_restaurant_details CHƯA tồn tại (nhà hàng vừa tạo) → is_local_specialty/dietary
          // VẮNG MẶT trong response (không phải `null`) — chỉ prefill khi thật sự có dữ liệu.
          if (details.is_local_specialty !== undefined) {
            setIsLocalSpecialty(details.is_local_specialty);
            setDietaryText(details.dietary ? JSON.stringify(details.dietary) : '');
          }
          setSelectedCuisines(new Set(details.cuisines.map((c) => c.code)));
        })
        .catch(() => {
          if (!cancelled) setState({ kind: 'error', message: 'Không tải được thông tin nhà hàng.' });
        });
    });
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  if (state.kind === 'loading') return <p style={{ color: 'var(--muted)' }}>Đang tải thông tin nhà hàng…</p>;
  if (state.kind === 'error') return <p className={styles.alert}>{state.message}</p>;

  function toggleCuisine(code: string) {
    setSelectedCuisines((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function onSave() {
    const session = readSession();
    if (!session) return;
    setError(null);
    setNotice(null);

    let dietary: Record<string, unknown> | null | undefined;
    if (dietaryText.trim()) {
      try {
        dietary = JSON.parse(dietaryText);
      } catch {
        setError('Chế độ ăn phải là JSON hợp lệ, vd {"vegetarian":true} — hoặc để trống.');
        return;
      }
    } else {
      dietary = null;
    }

    setBusy(true);
    try {
      const updated = await updateRestaurantDetails(
        placeId,
        { expected_content_version: contentVersion, is_local_specialty: isLocalSpecialty, dietary, cuisine_codes: Array.from(selectedCuisines) },
        session.accessToken,
      );
      setSelectedCuisines(new Set(updated.cuisines.map((c) => c.code)));
      onVersionChange(updated.content_version);
      setNotice('Đã lưu thông tin nhà hàng.');
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : 'Lưu thất bại. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Thông tin nhà hàng" className={styles.contentEditor}>
      <h2>Thông tin nhà hàng</h2>

      <label className={styles.checkboxField}>
        <input type="checkbox" checked={isLocalSpecialty} onChange={(e) => setIsLocalSpecialty(e.target.checked)} />
        <span>Có phục vụ đặc sản Phú Quốc</span>
      </label>

      <div style={{ marginTop: '0.75rem' }}>
        <span className={uiStyles.fieldLabel}>Loại ẩm thực</span>
        <div className={styles.fieldGrid} style={{ marginTop: '0.4rem' }}>
          {state.allCuisines.map((c) => (
            <label key={c.id} className={styles.checkboxField}>
              <input type="checkbox" checked={selectedCuisines.has(c.code)} onChange={() => toggleCuisine(c.code)} />
              <span>{c.label_vi}</span>
            </label>
          ))}
        </div>
      </div>

      <label className={uiStyles.field} style={{ marginTop: '0.75rem' }}>
        <span className={uiStyles.fieldLabel}>Chế độ ăn (JSON, vd {'{"vegetarian":true}'}) — để trống nếu chưa xác nhận</span>
        <input className={styles.input} type="text" value={dietaryText} onChange={(e) => setDietaryText(e.target.value)} placeholder='{"vegetarian":true}' />
      </label>

      {error && <p className={styles.alert} role="alert">{error}</p>}
      {notice && <p className={styles.success} role="status">{notice}</p>}

      <div className={styles.actions} style={{ marginTop: '0.75rem' }}>
        <button type="button" className={styles.submitBtn} onClick={() => void onSave()} disabled={busy}>
          {busy ? 'Đang lưu…' : 'Lưu thông tin nhà hàng'}
        </button>
      </div>
    </section>
  );
}
