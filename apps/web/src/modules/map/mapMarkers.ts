// Logic thuần (không phụ thuộc maplibre-gl) cho marker/popup của MapView — tách riêng để test
// được mà không cần nạp `maplibre-gl` (cần canvas/WebGL, không có trong Jest) hay CSS thật của nó.
import { formatPriceRange } from '@/modules/places/format';
import { PRICE_VERIFYING_TEXT, resolvePriceDisplay } from '@/modules/places/trust';
import type { Category } from '@/modules/categories/api/categories.api';
import type { PlaceDetail } from '@/modules/places/types';
import { DEFAULT_LOCALE, localizedHref, type Locale } from '@/lib/locale';
import styles from './map.module.css';

// Toạ độ hợp lệ: số hữu hạn, trong khoảng lat/lng của Trái Đất. Bỏ TỪNG marker lỗi thay vì để
// một hàng hỏng làm hỏng cả lô — trước đây `.setLngLat()` throw giữa `.map()` (sau khi marker cũ
// đã bị `.remove()`) khiến danh sách marker không bao giờ được gán lại, xoá sạch mọi marker cho
// tới lần refresh thành công kế tiếp (Map Audit Phase 3 — phòng vệ, DB hiện đã NOT NULL).
export function isValidCoord(lng: number, lat: number): boolean {
  return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90;
}

// Marker được maplibre gắn thẳng vào DOM ngoài cây React — `role="button"` một mình KHÔNG đủ để
// bàn phím/trình đọc màn hình kích hoạt được (div không tự nhận focus, không tự bắt Enter/Space
// như <button> thật). `bindActivation` gắn tabIndex + keydown ĐÚNG NGỮ NGHĨA `role="button"`, dùng
// chung cho cả cluster lẫn place — tránh lặp lại logic này ở hai hàm dựng marker.
function bindActivation(el: HTMLElement, onActivate: () => void): void {
  el.tabIndex = 0;
  el.onclick = onActivate;
  el.onkeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      onActivate();
    }
  };
}

export function clusterElement(count: number, onActivate: () => void): HTMLElement {
  const el = document.createElement('div');
  el.textContent = String(count);
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `${count} địa điểm — bấm để phóng to`);
  Object.assign(el.style, {
    background: '#2563eb',
    color: '#fff',
    borderRadius: '50%',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  } as CSSStyleDeclaration);
  bindActivation(el, onActivate);
  return el;
}

export function placeElement(title: string, onActivate: () => void): HTMLElement {
  const el = document.createElement('div');
  el.textContent = '📍';
  el.title = title;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', title);
  el.style.cursor = 'pointer';
  el.style.fontSize = '20px';
  bindActivation(el, onActivate);
  return el;
}

function textRow(text: string, className?: string): HTMLElement {
  const span = document.createElement('span');
  span.textContent = text;
  if (className) span.className = className;
  return span;
}

// Nội dung popup khi bấm marker địa điểm — tên/category/khu vực/thumbnail/rating/giá (những gì
// dữ liệu THỰC SỰ có, không suy diễn), + link "Xem chi tiết". `categories` (tuỳ chọn, do trang gọi
// truyền vào cùng bộ lọc) chỉ để đổi category_id → nhãn tiếng Việt; thiếu thì lùi về category_slug.
export function buildPopupCard(
  detail: PlaceDetail,
  categories?: Category[],
  locale: Locale = DEFAULT_LOCALE,
): HTMLElement {
  const card = document.createElement('div');
  card.className = styles.popup;

  if (detail.cover_image_url) {
    const img = document.createElement('img');
    img.className = styles.popupThumb;
    img.src = detail.cover_image_url;
    img.alt = detail.name;
    img.loading = 'lazy';
    card.appendChild(img);
  }

  const title = document.createElement('p');
  title.className = styles.popupTitle;
  title.textContent = detail.name;
  card.appendChild(title);

  const categoryLabel = categories?.find((c) => c.id === detail.category_id)?.name_vi ?? detail.category_slug;

  const meta = document.createElement('div');
  meta.className = styles.popupMeta;
  if (categoryLabel) meta.appendChild(textRow(categoryLabel));
  if (detail.ward) meta.appendChild(textRow(detail.ward));
  if (detail.rating_avg !== null) {
    meta.appendChild(
      textRow(
        `★ ${detail.rating_avg.toFixed(1)}${detail.rating_count > 0 ? ` (${detail.rating_count})` : ''}`,
        styles.popupRating,
      ),
    );
  }
  // Public Beta price trust gate (2026-08-28): raw giá chỉ hiện khi verification_status đã tin
  // cậy — cùng invariant dùng chung mọi surface public (xem places/trust.ts). Popup được gắn
  // thẳng vào DOM ngoài cây React nên KHÔNG được rò giá thật vào bất kỳ node nào ở đây.
  const { label: priceLabel, verifying: showPriceVerifying } = resolvePriceDisplay(
    formatPriceRange(detail.price_range),
    detail.verification_status,
  );
  if (priceLabel) meta.appendChild(textRow(priceLabel));
  else if (showPriceVerifying) meta.appendChild(textRow(PRICE_VERIFYING_TEXT));
  card.appendChild(meta);

  const link = document.createElement('a');
  link.className = styles.popupLink;
  link.href = localizedHref(locale, `/places/${detail.slug}`);
  link.textContent = 'Xem chi tiết →';
  card.appendChild(link);

  return card;
}

export function popupState(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = styles.popupState;
  el.textContent = text;
  return el;
}
