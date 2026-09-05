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

// Cụm: kích thước tăng nhẹ theo số lượng (3 bậc) để "cụm to hơn = nhiều điểm hơn" nhìn được ngay,
// nhưng chặn trần ở 56px — tránh bong bóng khổng lồ nuốt cả khung nhìn khi một khu vực có rất
// nhiều địa điểm (Phase 6.4: tránh cluster khổng lồ/nhãn chồng lấn khó đọc).
function clusterSize(count: number): number {
  if (count >= 50) return 56;
  if (count >= 10) return 44;
  return 34;
}

export function clusterElement(
  count: number,
  onActivate: () => void,
  ariaLabel: string = `${count} địa điểm — bấm để phóng to`,
): HTMLElement {
  const size = clusterSize(count);
  const el = document.createElement('div');
  el.className = styles.cluster;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.fontSize = size >= 44 ? '14px' : '12px';
  el.textContent = String(count);
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', ariaLabel);
  bindActivation(el, onActivate);
  return el;
}

// Pin SVG thay cho emoji 📍 (Phase 6.3): hình giọt nước cổ điển, đủ tương phản trên cả nền đất
// (raster OSM be/vàng nhạt) lẫn nền biển (xanh) vì viền trắng dày bao quanh khối màu đặc —
// emoji cũ không có viền nên gần như biến mất trên vài tông nền của tile OSM mặc định.
const PIN_SVG = `
<svg viewBox="0 0 28 36" width="28" height="36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <path class="${styles.pinBody}" d="M14 0C6.8 0 1 5.8 1 13c0 9.5 11.3 21.6 12.3 22.6.4.4 1 .4 1.4 0C15.7 34.6 27 22.5 27 13 27 5.8 21.2 0 14 0z"/>
  <circle class="${styles.pinDot}" cx="14" cy="13" r="5.5"/>
</svg>`.trim();

export function placeElement(title: string, onActivate: () => void): HTMLElement {
  const el = document.createElement('div');
  el.className = styles.placeMarker;
  el.innerHTML = PIN_SVG;
  el.title = title;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', title);
  bindActivation(el, onActivate);
  return el;
}

// Bật/tắt trạng thái "đang chọn" (Phase 6.3) — gọi từ MapView khi mở/đóng popup của marker này.
// Hàm riêng (không phải class CSS gắn cứng lúc dựng marker) vì trạng thái chọn đổi SAU khi marker
// đã tồn tại trên bản đồ, không phải lúc dựng.
export function setMarkerSelected(el: HTMLElement, selected: boolean): void {
  el.classList.toggle(styles.placeMarkerSelected, selected);
  el.setAttribute('aria-current', selected ? 'true' : 'false');
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
  } else {
    // Không ảnh vỡ, không khoảng trắng đột ngột: chữ cái đầu tên địa điểm trên nền màu — cùng
    // hướng xử lý PlaceCard.thumbFallback ở danh sách, để popup và thẻ danh sách nhất quán.
    const placeholder = document.createElement('div');
    placeholder.className = styles.popupThumbFallback;
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.textContent = detail.name.charAt(0);
    card.appendChild(placeholder);
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

  if (detail.short_description) {
    const desc = document.createElement('p');
    desc.className = styles.popupDesc;
    desc.textContent = detail.short_description;
    card.appendChild(desc);
  }

  const link = document.createElement('a');
  link.className = styles.popupLink;
  link.href = localizedHref(locale, `/places/${detail.slug}`);
  link.textContent = locale === 'en' ? 'View details →' : 'Xem chi tiết →';
  card.appendChild(link);

  return card;
}

export function popupState(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = styles.popupState;
  el.textContent = text;
  return el;
}
