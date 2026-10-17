import type { JSONContent } from '@tiptap/core';
import type { RichParagraphBlock, RichListBlock, RichRun } from '@phuquochub/shared-types';

// Gói D — cầu nối giữa Tiptap (UI soạn thảo trực tiếp: nút bấm, không gõ cú pháp) và RichDoc (định
// dạng LƯU, xem packages/shared-types/src/rich-doc.ts). CHỦ Ý CHỈ xử lý khối VĂN XUÔI (đoạn/tiêu đề
// phụ/trích dẫn/danh sách) — khối BẢNG soạn bằng một widget React riêng (RichTableEditor), KHÔNG
// đi qua schema ProseMirror của Tiptap. Lý do: bảng trong RichDoc là dữ liệu dạng lưới (hàng/cột/
// hàng tiêu đề/caption) — ép vào schema bảng của ProseMirror (vốn cho soạn thảo tài liệu kiểu Word,
// có resize/merge cell) tốn nhiều mã hơn, dễ vỡ hơn, để lấy ra một mô hình ĐƠN GIẢN HƠN những gì
// chính ProseMirror cho — bảng dùng input text thuần, không đậm/nghiêng/link trong ô (có chủ ý, xem
// ghi chú RichTableEditor.tsx).

export type ProseBlock = RichParagraphBlock | RichListBlock;

function runToInline(run: RichRun): JSONContent {
  const marks: NonNullable<JSONContent['marks']> = [];
  if (run.bold) marks.push({ type: 'bold' });
  if (run.italic) marks.push({ type: 'italic' });
  if (run.href) marks.push({ type: 'link', attrs: { href: run.href } });
  // Tiptap/ProseMirror từ chối text node rỗng — một run text:'' (hiếm, vd vừa xoá hết chữ) bị bỏ,
  // không đưa vào content (một node đoạn văn RỖNG vẫn hợp lệ, content: [] hoặc content: undefined).
  if (run.text.length === 0) return { type: 'text', text: '​' }; // zero-width, giữ vị trí con trỏ — lọc lại khi convert ngược
  return { type: 'text', text: run.text, ...(marks.length ? { marks } : {}) };
}

function runsToInline(runs: RichRun[]): JSONContent[] {
  const content = runs.map(runToInline);
  return content.length ? content : [];
}

function blockToTiptap(block: ProseBlock): JSONContent {
  if (block.type === 'p') return { type: 'paragraph', content: runsToInline(block.runs) };
  if (block.type === 'heading2') return { type: 'heading', attrs: { level: 2 }, content: runsToInline(block.runs) };
  if (block.type === 'heading3') return { type: 'heading', attrs: { level: 3 }, content: runsToInline(block.runs) };
  if (block.type === 'blockquote') {
    return { type: 'blockquote', content: [{ type: 'paragraph', content: runsToInline(block.runs) }] };
  }
  // TS không tự thu hẹp hết `ProseBlock` chỉ bằng phủ định bốn literal 'p'/'heading2'/'heading3'/
  // 'blockquote' CÙNG thuộc một thành viên union (RichParagraphBlock) qua các `if` rời nhau — kiểm
  // dương tường minh `type === 'list'` ở đây để thu hẹp đúng, không dựa vào fallthrough ngầm định.
  if (block.type === 'list') {
    return {
      type: block.ordered ? 'orderedList' : 'bulletList',
      content: block.items.map((item) => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: runsToInline(item) }],
      })),
    };
  }
  // Không thể tới đây (ProseBlock chỉ có 5 type) — throw thay vì `as never` im lặng, giúp bắt lỗi
  // sớm nếu RichBlock mở rộng loại mới mà tiptap-bridge.ts chưa theo kịp.
  throw new Error(`loại khối văn xuôi không được hỗ trợ: ${(block as { type: string }).type}`);
}

/** `blocks` rỗng → tài liệu Tiptap tối thiểu hợp lệ (một đoạn văn rỗng) — doc không bao giờ content: []. */
export function proseBlocksToTiptapJSON(blocks: ProseBlock[]): JSONContent {
  const content = blocks.map(blockToTiptap);
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

function textNodeToRun(node: JSONContent): RichRun | null {
  if (node.type !== 'text' || typeof node.text !== 'string') return null;
  const text = node.text.replace(/​/g, '');
  if (text.length === 0 && !(node.marks && node.marks.length)) return null;
  const run: RichRun = { text };
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') run.bold = true;
    else if (mark.type === 'italic') run.italic = true;
    else if (mark.type === 'link' && typeof mark.attrs?.href === 'string') run.href = mark.attrs.href as string;
  }
  return run;
}

function inlineToRuns(content: JSONContent[] | undefined): RichRun[] {
  if (!content) return [];
  const runs: RichRun[] = [];
  for (const node of content) {
    const run = textNodeToRun(node);
    if (run) runs.push(run);
  }
  return runs;
}

/** Lấy runs của ĐOẠN VĂN ĐẦU TIÊN bên trong một node (listItem/blockquote bọc đúng một paragraph theo cấu hình blockToTiptap() ở trên). */
function firstParagraphRuns(node: JSONContent): RichRun[] {
  const firstChild = node.content?.[0];
  if (!firstChild || firstChild.type !== 'paragraph') return [];
  return inlineToRuns(firstChild.content);
}

function topNodeToBlock(node: JSONContent): ProseBlock | null {
  if (node.type === 'paragraph') return { type: 'p', runs: inlineToRuns(node.content) };
  if (node.type === 'heading') {
    const level = node.attrs?.level === 3 ? 3 : 2;
    return { type: level === 3 ? 'heading3' : 'heading2', runs: inlineToRuns(node.content) };
  }
  if (node.type === 'blockquote') return { type: 'blockquote', runs: firstParagraphRuns(node) };
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    const items = (node.content ?? []).map((li) => firstParagraphRuns(li));
    return { type: 'list', ordered: node.type === 'orderedList', items };
  }
  return null; // node lạ (không nên xảy ra — schema editor đã giới hạn) → bỏ qua an toàn
}

/** Diễn giải ngược tài liệu Tiptap (sau khi người dùng soạn) thành mảng ProseBlock cho RichDoc. */
export function tiptapJSONToProseBlocks(doc: JSONContent): ProseBlock[] {
  const blocks = (doc.content ?? []).map(topNodeToBlock).filter((b): b is ProseBlock => b !== null);
  // Loại đoạn văn HOÀN TOÀN rỗng Ở ĐẦU/CUỐI tài liệu (editor trống, hoặc người dùng xoá hết) — giữ
  // đoạn rỗng Ở GIỮA (ngắt đoạn có chủ ý) vì đó là nội dung thật người dùng đang soạn dở.
  while (blocks.length && blocks[0].type === 'p' && blocks[0].runs.length === 0) blocks.shift();
  while (blocks.length && blocks[blocks.length - 1].type === 'p' && (blocks[blocks.length - 1] as RichParagraphBlock).runs.length === 0) {
    blocks.pop();
  }
  return blocks;
}
