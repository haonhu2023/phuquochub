/** 5 ô sao — true = đầy, dùng để render mà không lặp logic so sánh trong component. */
export function ratingStars(rating: number): boolean[] {
  return Array.from({ length: 5 }, (_, i) => i < rating);
}

/** Định dạng ngày tạo review theo vi-VN (không giờ — MVP không cần độ chính xác đến phút). */
export function formatReviewDate(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', { year: 'numeric', month: 'long', day: 'numeric' });
}
