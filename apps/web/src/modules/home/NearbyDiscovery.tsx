'use client';

import { useState } from 'react';
import { nearby } from '@/modules/map/api/geo.api';
import { PlaceCard } from '@/modules/places/PlaceCard';
import type { PlaceCard as PlaceCardType } from '@/modules/places/types';
import type { Locale } from '@/lib/locale';
import placeStyles from '@/modules/places/places.module.css';
import styles from './home.module.css';

type State = { kind: 'idle' } | { kind: 'loading' } | { kind: 'denied' } | { kind: 'error' } | { kind: 'ok'; places: PlaceCardType[] };

interface Copy {
  cta: string;
  loading: string;
  denied: string;
  error: string;
  empty: string;
  privacyNote: string;
}

/**
 * "Gần bạn" (Phase 8/9/32) — module "thông minh" DUY NHẤT trên trang chủ có ý nghĩa "smart" thật:
 * dùng toạ độ thật của trình duyệt (SAU KHI người dùng đồng ý) gọi thẳng `GET /geo/nearby` (API
 * CÓ THẬT, không suy diễn/không AI giả). Không có bước này thì trang/web KHÔNG kém đi — nút chỉ là
 * một lối tắt, không phải điều kiện để dùng trang chủ (đúng yêu cầu "nếu từ chối, site vẫn dùng
 * được bình thường").
 *
 * KHÔNG lưu toạ độ (không state ngoài component, không localStorage, không gửi đâu khác ngoài
 * chính lệnh gọi `nearby()` một lần). Đây là "đảo" client DUY NHẤT của khối này — phần còn lại của
 * trang chủ vẫn là Server Component, và khối này không tải bất kỳ thứ gì (MapLibre, ảnh nặng) cho
 * tới khi người dùng chủ động bấm nút.
 */
export function NearbyDiscovery({ locale, copy }: { locale: Locale; copy: Copy }) {
  const [state, setState] = useState<State>({ kind: 'idle' });

  function handleClick() {
    // Kiểm tra GIÁ TRỊ (không phải chỉ tên thuộc tính có tồn tại hay không) — một số môi trường
    // (test, trình duyệt cũ, iframe hạn chế) có thể có `navigator.geolocation === undefined`
    // trong khi `'geolocation' in navigator` vẫn trả `true`.
    if (!navigator.geolocation) {
      setState({ kind: 'error' });
      return;
    }
    setState({ kind: 'loading' });
    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          void (async () => {
            try {
              const places = await nearby(position.coords.latitude, position.coords.longitude, 5000);
              setState({ kind: 'ok', places: places.slice(0, 4) });
            } catch {
              setState({ kind: 'error' });
            }
          })();
        },
        (err) => {
          setState(err.code === err.PERMISSION_DENIED ? { kind: 'denied' } : { kind: 'error' });
        },
        { timeout: 10_000, maximumAge: 60_000 },
      );
    } catch {
      setState({ kind: 'error' });
    }
  }

  return (
    <div className={styles.nearbyCard}>
      {state.kind === 'idle' && (
        <>
          <button type="button" className={styles.nearbyButton} onClick={handleClick}>
            {copy.cta}
          </button>
          <p className={styles.nearbyPrivacyNote}>{copy.privacyNote}</p>
        </>
      )}
      {state.kind === 'loading' && (
        <p role="status" className={styles.nearbyStatus}>
          {copy.loading}
        </p>
      )}
      {state.kind === 'denied' && (
        <p role="status" className={styles.nearbyStatus}>
          {copy.denied}
        </p>
      )}
      {state.kind === 'error' && (
        <p role="status" className={styles.nearbyStatus}>
          {copy.error}
        </p>
      )}
      {state.kind === 'ok' && state.places.length === 0 && (
        <p role="status" className={styles.nearbyStatus}>
          {copy.empty}
        </p>
      )}
      {state.kind === 'ok' && state.places.length > 0 && (
        <div className={placeStyles.grid}>
          {state.places.map((p) => (
            <PlaceCard key={p.id} place={p} titleAs="h3" locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}
