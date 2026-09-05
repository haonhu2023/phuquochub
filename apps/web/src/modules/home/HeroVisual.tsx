import type { Locale } from '@/lib/locale';
import styles from './home.module.css';

export interface HeroVisualPlace {
  id: string;
  name: string;
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
export function HeroVisual({ locale, places }: { locale: Locale; places: HeroVisualPlace[] }) {
  return (
    <div className={styles.heroVisual} aria-hidden="true">
      <div className={styles.heroVisualIsland} />
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
