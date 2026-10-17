import type { RichDoc } from '@phuquochub/shared-types';

/**
 * Chuyển văn bản thuần CŨ thành một RichDoc TẠM, chỉ dùng để MỒI nội dung ban đầu khi mở editor cho
 * một tin CHƯA có `description_rich` — KHÔNG lưu gì tự động, người dùng vẫn phải bấm Lưu như bình
 * thường. Mỗi dòng (`\n`) thành một đoạn văn riêng — khác hẳn renderer công khai (giữ NGUYÊN một
 * `<p>` với `white-space: pre-wrap`, xem RichDescriptionRenderer's fallback) vì mục đích khác nhau:
 * đây là điểm khởi đầu để SOẠN TIẾP bằng nút bấm (owner yêu cầu "không bắt nhập lại"), không phải
 * hiển thị cuối cùng. Dòng trống (đoạn ngắt đôi) thành một đoạn rỗng — giữ đúng cấu trúc đoạn cũ.
 */
export function plainTextToRichDoc(text: string): RichDoc {
  const lines = text.split('\n');
  return {
    v: 1,
    blocks: lines.map((line) => ({ type: 'p' as const, runs: line.length ? [{ text: line }] : [] })),
  };
}
