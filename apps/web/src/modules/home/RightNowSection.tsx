import Link from 'next/link';
import { listRightNow } from '@/modules/places/api/places.api';
import { PlaceCard } from '@/modules/places/PlaceCard';
import type { PlaceNowCard } from '@/modules/places/types';
import { getOpeningToday, type OpeningState } from '@/modules/places/openingHours';
import { localizedHref, type Locale } from '@/lib/locale';
import { getHomeCopy } from './home.copy';
import placeStyles from '@/modules/places/places.module.css';
import styles from './home.module.css';

/** Số thẻ hiển thị — khối trang chủ CÓ CHẶN TRÊN, khớp trần mặc định của GET /places/now. */
export const RIGHT_NOW_LIMIT = 6;

const OPENING_STATE_STYLE: Record<OpeningState, string> = {
  open: styles.rightNowOpeningStateOpen,
  closed: styles.rightNowOpeningStateClosed,
  unknown: styles.rightNowOpeningStateUnknown,
};

/**
 * "Right Now" MVP — Server Component, cùng khuôn mẫu với `DiscoverPlaces` (lời gọi API tự bọc
 * try/catch, thất bại chỉ thu nhỏ đúng khối này, không bao giờ làm sập trang chủ).
 *
 * Server Component (KHÔNG 'use client') là chủ đích: `getOpeningToday()` cần một mốc "bây giờ" —
 * tính ở server tại thời điểm render tránh mọi khác biệt giữa HTML server phát ra và lần render
 * đầu ở client (không có hydration mismatch nào về giờ giấc, không cần theo dõi đồng hồ máy khách).
 *
 * `GET /places/now` KHÔNG còn là "trusted-only" (đã gỡ whitelist `verification_status` — 2026-09-08
 * PR #24 final review): nó chỉ trả place `published` CÓ opening_hours VÀ có bằng chứng đối chiếu
 * nguồn cho ĐÚNG giá trị opening_hours hiện tại (field-evidence, không phải trạng thái xác minh
 * toàn bộ place — xem PlacesRepository.rightNow()). Server không suy diễn open/closed — trang này
 * chỉ ĐỌC state đó qua `getOpeningToday().state`, KHÔNG BAO GIỜ dùng `.label` trực tiếp (nhãn đó
 * luôn tiếng Việt bất kể locale). Văn bản hiển thị lấy từ `home.copy.ts` để đúng VI/EN. `unknown`
 * KHÔNG BAO GIỜ hiển thị như `closed`.
 *
 * `showTrustBadge={false} showPrice={false}` trên PlaceCard bên dưới (2026-09-09 Discovery trust
 * surface follow-up): field-evidence ở trên chỉ chứng minh MỘT trường (opening_hours) — không chứng
 * minh danh tính/chủ sở hữu hay giá — nên khối này không được hiện badge "Đã xác minh" chung hay giá
 * thật dựa trên `verification_status` (whole-place, không cùng phạm vi với claim mà khối này đưa ra).
 */
export async function RightNowSection({ locale }: { locale: Locale }) {
  const copy = getHomeCopy(locale);
  let places: PlaceNowCard[];
  try {
    places = await listRightNow({ locale, limit: RIGHT_NOW_LIMIT });
  } catch {
    return (
      <Section locale={locale}>
        <p className={styles.sectionError} role="status">
          {copy.rightNowError}
        </p>
      </Section>
    );
  }

  if (places.length === 0) {
    return (
      <Section locale={locale}>
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>{copy.rightNowEmptyTitle}</p>
          <p>{copy.rightNowEmptyBody}</p>
        </div>
      </Section>
    );
  }

  return (
    <Section locale={locale}>
      <div className={placeStyles.grid}>
        {places.map((place) => {
          const openingState = getOpeningToday(place.opening_hours).state;
          const openingText =
            openingState === 'open'
              ? copy.rightNowOpenNow
              : openingState === 'closed'
                ? copy.rightNowClosedNow
                : copy.rightNowHoursUnknown;
          return (
            <div key={place.id} className={styles.rightNowItem}>
              {/* titleAs="h3": tiêu đề khối là <h2>, nên tên địa điểm phải nằm DƯỚI nó một bậc.
                  showTrustBadge/showPrice=false: field-evidence ở trên chỉ đối chiếu opening_hours,
                  không chứng minh danh tính/giá — xem chú thích khối này ở đầu file. */}
              <PlaceCard place={place} titleAs="h3" locale={locale} showTrustBadge={false} showPrice={false} />
              <p className={`${styles.rightNowOpeningState} ${OPENING_STATE_STYLE[openingState]}`}>
                {openingText}
              </p>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function Section({ children, locale }: { children: React.ReactNode; locale: Locale }) {
  const copy = getHomeCopy(locale);
  return (
    <section className={styles.section} aria-labelledby="home-right-now-title">
      <div className={styles.sectionHead}>
        <h2 id="home-right-now-title" className={styles.sectionTitle}>
          {copy.rightNowTitle}
        </h2>
        <Link href={localizedHref(locale, '/places')} className={styles.sectionLink}>
          {copy.discoverMoreLink}
        </Link>
      </div>
      {children}
    </section>
  );
}

/** Khung chờ bám sát bố cục thật (lưới thẻ) để hạn chế layout shift khi khối này stream vào. */
export function RightNowSectionSkeleton({ locale }: { locale: Locale }) {
  const copy = getHomeCopy(locale);
  return (
    <section className={styles.section} aria-busy="true" aria-label={copy.rightNowLoadingLabel}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{copy.rightNowTitle}</h2>
      </div>
      <div className={placeStyles.grid}>
        {Array.from({ length: RIGHT_NOW_LIMIT }).map((_, i) => (
          <div key={i} className={placeStyles.card}>
            <div className={`${placeStyles.skeleton} ${placeStyles.skelThumb}`} />
            <div className={placeStyles.cardBody}>
              <div
                className={`${placeStyles.skeleton} ${placeStyles.skelLine}`}
                style={{ margin: 0, height: '1.1rem' }}
              />
              <div
                className={`${placeStyles.skeleton} ${placeStyles.skelLine} ${placeStyles.skelLineShort}`}
                style={{ marginLeft: 0 }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
