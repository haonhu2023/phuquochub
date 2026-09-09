'use client';

import { useState } from 'react';
import { nearbyTrusted } from '@/modules/map/api/geo.api';
import { PlaceCard } from '@/modules/places/PlaceCard';
import type { PlaceNowCard } from '@/modules/places/types';
import { getOpeningToday, type OpeningState } from '@/modules/places/openingHours';
import type { Locale } from '@/lib/locale';
import placeStyles from '@/modules/places/places.module.css';
import styles from './home.module.css';

type State = { kind: 'idle' } | { kind: 'loading' } | { kind: 'denied' } | { kind: 'error' } | { kind: 'ok'; places: PlaceNowCard[] };

interface Copy {
  cta: string;
  loading: string;
  denied: string;
  error: string;
  empty: string;
  privacyNote: string;
  openNow: string;
  closedNow: string;
  hoursUnknown: string;
}

const OPENING_STATE_STYLE: Record<OpeningState, string> = {
  open: styles.nearbyOpeningStateOpen,
  closed: styles.nearbyOpeningStateClosed,
  unknown: styles.nearbyOpeningStateUnknown,
};

/**
 * "Gần bạn" (Phase 8/9/32; Trusted Nearby + Opening State v0 Phase 2) — module "thông minh" DUY
 * NHẤT trên trang chủ có ý nghĩa "smart" thật: dùng toạ độ thật của trình duyệt (SAU KHI người
 * dùng đồng ý) gọi thẳng `GET /geo/nearby-trusted` (API CÓ THẬT, không suy diễn/không AI giả).
 * Không có bước này thì trang/web KHÔNG kém đi — nút chỉ là một lối tắt, không phải điều kiện để
 * dùng trang chủ (đúng yêu cầu "nếu từ chối, site vẫn dùng được bình thường").
 *
 * KHÔNG lưu toạ độ (không state ngoài component, không localStorage, không gửi đâu khác ngoài
 * chính lệnh gọi `nearbyTrusted()` một lần). Đây là "đảo" client DUY NHẤT của khối này — phần còn
 * lại của trang chủ vẫn là Server Component, và khối này không tải bất kỳ thứ gì (MapLibre, ảnh
 * nặng) cho tới khi người dùng chủ động bấm nút.
 *
 * Trạng thái mở/đóng cửa dùng `getOpeningToday(place.opening_hours).state` — CHỈ lấy `state`, KHÔNG
 * dùng `.label` (nhãn đó luôn tiếng Việt bất kể locale). Văn bản hiển thị lấy từ `copy`
 * (home.copy.ts) để đúng VI/EN. `unknown` KHÔNG BAO GIỜ hiển thị như `closed` — dữ liệu chưa đọc
 * được không được biến thành lời khẳng định sai (xem openingHours.ts).
 *
 * `p.opening_hours` ở đây đã qua field-evidence gate phía server (2026-09-09, follow-up sau PR #24:
 * `PlacesRepository.nearbyTrusted()` trả `null` cho place KHÔNG có bằng chứng đối chiếu nguồn cho
 * ĐÚNG giá trị opening_hours hiện tại — xem chú thích method đó) — khối này không tự suy đoán gì
 * thêm, chỉ đọc lại state đã null-hoá đúng cách.
 *
 * `showTrustBadge={false} showPrice={false}` trên PlaceCard bên dưới: cùng lý do RightNowSection —
 * field-evidence chỉ chứng minh MỘT trường (opening_hours), không chứng minh danh tính/chủ sở hữu
 * hay giá, nên không mượn badge "Đã xác minh"/giá thật của whole-place `verification_status`.
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
              const places = await nearbyTrusted(position.coords.latitude, position.coords.longitude, 5000);
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
          {state.places.map((p) => {
            const openingState = getOpeningToday(p.opening_hours).state;
            const openingText =
              openingState === 'open' ? copy.openNow : openingState === 'closed' ? copy.closedNow : copy.hoursUnknown;
            return (
              <div key={p.id} className={styles.nearbyItem}>
                <PlaceCard place={p} titleAs="h3" locale={locale} showTrustBadge={false} showPrice={false} />
                <p className={`${styles.nearbyOpeningState} ${OPENING_STATE_STYLE[openingState]}`}>{openingText}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
