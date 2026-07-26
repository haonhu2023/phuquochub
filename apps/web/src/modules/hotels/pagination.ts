export type PageItem = number | 'ellipsis';

/**
 * Danh sách số trang hiển thị quanh trang hiện tại (kiểu "1 … 4 5 [6] 7 8 … 20") — luôn giữ
 * trang đầu/cuối, tối đa 1 dấu "…" mỗi bên. Tách khỏi component để test được thuần không cần DOM.
 */
export function buildPageList(current: number, totalPages: number, siblings = 1): PageItem[] {
  if (totalPages <= 1) return [1];

  const pages = new Set<number>([1, totalPages, current]);
  for (let d = 1; d <= siblings; d++) {
    if (current - d >= 1) pages.add(current - d);
    if (current + d <= totalPages) pages.add(current + d);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: PageItem[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      result.push('ellipsis');
    }
    result.push(sorted[i]);
  }
  return result;
}
