import Image from 'next/image';
import type { Locale } from '@/lib/locale';
import styles from './home.module.css';

export interface HeroVisualPlace {
  id: string;
  name: string;
}

export interface HeroVisualProps {
  locale: Locale;
  places: HeroVisualPlace[];
  /** S1 (2026-09-22) — ảnh hero owner tự tải lên qua CMS (`site_content.home_hero.heroMediaId`),
   *  KHÔNG PHẢI ảnh chụp bên thứ ba (xem đoạn chú thích dưới: composition này vẫn KHÔNG tải ảnh
   *  chụp từ nguồn ngoài). `null`/không truyền → giữ nguyên composition CSS thuần như trước. */
  heroImageUrl?: string | null;
}

/**
 * Composition thị giác bên phải Hero (V3, Phase 3) — làm trang chủ "đáng nhớ ngay cả khi KHÔNG có
 * ảnh nào": một tấm nền gợi hình đảo/biển bằng CSS thuần + vài "mini card" mang DỮ LIỆU THẬT (tên
 * địa điểm thật do `HomeHero` truyền vào, không phải placeholder) + vài chấm định vị kiểu pin bản
 * đồ. Không tải MapLibre, không ảnh chụp bên thứ ba.
 *
 * Component THUẦN ĐỒNG BỘ có chủ đích (không tự fetch): `HomeHero` (async, gọi `listPlaces` MỘT
 * LẦN) truyền `places` xuống — giữ component này render/test được bằng `render()` bình thường,
 * cùng lý do `DiscoverPlaces` (async, fetch) và phần hiển thị của nó vẫn tách rời được trong test.
 *
 * KHÔNG suy diễn vị trí pin từ toạ độ thật — các chấm chỉ trang trí, không tuyên bố đã chiếu toạ độ
 * lên bản đồ này (Phase 9 lưu ý rõ: không ngụ ý toạ độ đã được xác minh/chiếu chính xác ở đây).
 */
export function HeroVisual({ locale, places, heroImageUrl }: HeroVisualProps) {
  return (
    <div className={styles.heroVisual} aria-hidden="true">
      {heroImageUrl ? (
        // 2026-10-22 (rà soát hiệu năng) — same-origin (xem ghi chú PlaceCard.tsx). `fill` khớp
        // ĐÚNG CSS `.heroVisualPhoto` đã có sẵn (position:absolute; inset:0; object-fit:cover) —
        // không cần đổi cấu trúc DOM, `.heroVisual` cha đã `position:relative` sẵn. `priority`:
        // đây gần như chắc chắn là phần tử LCP của trang chủ (ảnh hero trên-màn-hình-đầu-tiên).
        <Image
          src={heroImageUrl}
          alt=""
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className={styles.heroVisualPhoto}
          priority
        />
      ) : (
        <div className={styles.heroVisualIsland} />
      )}
      <span className={`${styles.heroVisualPin} ${styles.heroPinA}`} />
      <span className={`${styles.heroVisualPin} ${styles.heroPinB}`} />
      <span className={`${styles.heroVisualPin} ${styles.heroPinC}`} />

      {places.slice(0, 3).map((place, i) => (
        <div key={place.id} className={`${styles.heroMiniCard} ${styles[`heroMiniCard${i}`] ?? ''}`}>
          <span className={styles.heroMiniCardDot} />
          <span className={styles.heroMiniCardName}>{place.name}</span>
        </div>
      ))}

      <div className={styles.heroVisualChips}>
        <span className={styles.heroVisualChip}>{locale === 'en' ? 'Beaches' : 'Bãi biển'}</span>
        <span className={styles.heroVisualChip}>{locale === 'en' ? 'Food' : 'Ăn uống'}</span>
        <span className={styles.heroVisualChip}>{locale === 'en' ? 'Map' : 'Bản đồ'}</span>
      </div>
    </div>
  );
}
