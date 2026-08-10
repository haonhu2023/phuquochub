// Logic thuần (không phụ thuộc maplibre-gl) cho marker/popup của MapView — tách riêng để test
// được mà không cần nạp `maplibre-gl` (cần canvas/WebGL, không có trong Jest) hay CSS thật của nó.
import { formatPriceRange } from '@/modules/places/format';
import type { Category } from '@/modules/categories/api/categories.api';
import type { PlaceDetail } from '@/modules/places/types';
import styles from './map.module.css';

// Toạ độ hợp lệ: số hữu hạn, trong khoảng lat/lng của Trái Đất. Bỏ TỪNG marker lỗi thay vì để
// một hàng hỏng làm hỏng cả lô — trước đây `.setLngLat()` throw giữa `.map()` (sau khi marker cũ
// đã bị `.remove()`) khiến danh sách marker không bao giờ được gán lại, xoá sạch mọi marker cho
// tới lần refresh thành công kế tiếp (Map Audit Phase 3 — phòng vệ, DB hiện đã NOT NULL).
export function isValidCoord(lng: number, lat: number): boolean {
  return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90;
}

export function clusterElement(count: number): HTMLElement {
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
  return el;
}

export function placeElement(title: string): HTMLElement {
  const el = document.createElement('div');
  el.textContent = '📍';
  el.title = title;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', title);
  el.style.cursor = 'pointer';
  el.style.fontSize = '20px';
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
export function buildPopupCard(detail: PlaceDetail, categories?: Category[]): HTMLElement {
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
  const priceLabel = formatPriceRange(detail.price_range);
  if (priceLabel) meta.appendChild(textRow(priceLabel));
  card.appendChild(meta);

  const link = document.createElement('a');
  link.className = styles.popupLink;
  link.href = `/places/${detail.slug}`;
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
