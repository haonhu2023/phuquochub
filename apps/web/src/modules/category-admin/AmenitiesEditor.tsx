'use client';

import { useEffect, useState } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { listAllAmenities, listPlaceAmenities, updatePlaceAmenities } from '@/modules/amenities/api/amenities.api';
import type { Amenity } from '@/modules/amenities/types';
import styles from '@/modules/place-management/place-management.module.css';

interface Props {
  placeId: string;
  // CAS thật (2026-09-30) — token `places.content_version` do EditPlaceView (cha) giữ, dùng chung
  // với HotelDetailsEditor/RestaurantDetailsEditor anh em trên CÙNG place (xem HotelDetailsEditor.
  // tsx's ghi chú đầy đủ). GET /places/:id/amenities (công khai) không trả content_version — đây
  // là NGUỒN DUY NHẤT của token cho component này.
  contentVersion: number;
  onVersionChange: (v: number) => void;
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; all: Amenity[] };

/**
 * Tiện ích — dict DÙNG CHUNG (place_amenities.place_id, KHÔNG phải khái niệm riêng của khách sạn),
 * nhúng vào EditPlaceView cho MỌI category cần (hotel/restaurant). PUT thay TOÀN BỘ gán.
 */
export function AmenitiesEditor({ placeId, contentVersion, onVersionChange }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAllAmenities(), listPlaceAmenities(placeId)])
      .then(([all, assigned]) => {
        if (cancelled) return;
        setState({ kind: 'ready', all });
        setSelected(new Set(assigned.map((a) => a.code)));
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error', message: 'Không tải được danh sách tiện ích.' });
      });
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  if (state.kind === 'loading') return <p style={{ color: 'var(--muted)' }}>Đang tải tiện ích…</p>;
  if (state.kind === 'error') return <p className={styles.alert}>{state.message}</p>;

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  const byGroup = new Map<string, Amenity[]>();
  for (const a of state.all) {
    const group = a.group ?? 'khác';
    byGroup.set(group, [...(byGroup.get(group) ?? []), a]);
  }

  async function onSave() {
    const session = readSession();
    if (!session) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const updated = await updatePlaceAmenities(placeId, Array.from(selected), contentVersion, session.accessToken);
      setSelected(new Set(updated.amenities.map((a) => a.code)));
      onVersionChange(updated.content_version);
      setNotice('Đã lưu tiện ích.');
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : 'Lưu thất bại. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Tiện ích" className={styles.contentEditor}>
      <h2>Tiện ích</h2>
      {Array.from(byGroup.entries()).map(([group, amenities]) => (
        <div key={group} className={styles.section}>
          <p className={styles.sectionTitle}>{group}</p>
          <div className={styles.fieldGrid}>
            {amenities.map((a) => (
              <label key={a.id} className={styles.checkboxField}>
                <input type="checkbox" checked={selected.has(a.code)} onChange={() => toggle(a.code)} />
                <span>{a.label_vi}</span>
              </label>
            ))}
          </div>
        </div>
      ))}

      {error && <p className={styles.alert} role="alert">{error}</p>}
      {notice && <p className={styles.success} role="status">{notice}</p>}

      <div className={styles.actions} style={{ marginTop: '0.75rem' }}>
        <button type="button" className={styles.submitBtn} onClick={() => void onSave()} disabled={busy}>
          {busy ? 'Đang lưu…' : 'Lưu tiện ích'}
        </button>
      </div>
    </section>
  );
}
