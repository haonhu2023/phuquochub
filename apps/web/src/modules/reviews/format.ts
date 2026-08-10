import type { PlaceMedia } from '@phuquochub/shared-types';

/** 5 ô sao — true = đầy, dùng để render mà không lặp logic so sánh trong component. */
export function ratingStars(rating: number): boolean[] {
  return Array.from({ length: 5 }, (_, i) => i < rating);
}

/** Định dạng ngày tạo review theo vi-VN (không giờ — MVP không cần độ chính xác đến phút). */
export function formatReviewDate(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * URL để render một media của review — ưu tiên thumbnail_url (cùng quy ước gallery Place ở
 * places/[slug]/page.tsx: `m.thumbnail_url ?? m.url`), trả `null` khi cả hai đều rỗng/không hợp lệ
 * để component có thể bỏ qua item đó thay vì render `<img src="">` (request lại chính trang hiện tại).
 */
export function reviewMediaSrc(media: PlaceMedia): string | null {
  const src = media.thumbnail_url || media.url;
  return typeof src === 'string' && src.trim() !== '' ? src : null;
}

/** Alt text cho ảnh review — ưu tiên alt_text do người kiểm duyệt/tác giả đặt, sau đó caption, cuối
 * cùng một nhãn chung chung để luôn có alt hợp lệ cho a11y (không bao giờ để trống). */
export function reviewMediaAlt(media: PlaceMedia): string {
  return media.alt_text || media.caption || 'Ảnh đánh giá';
}
