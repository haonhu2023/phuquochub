import type { RichBlock, RichDoc, RichTableBlock } from '@phuquochub/shared-types';
import type { ProseBlock } from './tiptap-bridge';

// RichDescriptionEditor chia `RichDoc.blocks` (mảng phẳng) thành các "đoạn soạn thảo" (segment) nối
// tiếp nhau: một segment VĂN XUÔI (nhiều block liên tiếp không phải bảng, một Tiptap instance) hoặc
// một segment BẢNG (đúng một block bảng, một RichTableEditor) — xem ghi chú đầu tiptap-bridge.ts
// cho lý do tách bảng khỏi Tiptap. Thứ tự segment = thứ tự block gốc, bảo toàn khi ghép lại.

export type Segment = { kind: 'prose'; id: string; blocks: ProseBlock[] } | { kind: 'table'; id: string; block: RichTableBlock };

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `seg-${idCounter}`;
}

export function docToSegments(doc: RichDoc): Segment[] {
  const segments: Segment[] = [];
  let currentProse: ProseBlock[] = [];
  const flushProse = () => {
    if (currentProse.length > 0) {
      segments.push({ kind: 'prose', id: newId(), blocks: currentProse });
      currentProse = [];
    }
  };
  for (const block of doc.blocks) {
    if (block.type === 'table') {
      flushProse();
      segments.push({ kind: 'table', id: newId(), block });
    } else {
      currentProse.push(block);
    }
  }
  flushProse();
  // Tài liệu rỗng (tin mới) vẫn cần MỘT segment văn xuôi để Tiptap có chỗ gắn vào.
  if (segments.length === 0) segments.push({ kind: 'prose', id: newId(), blocks: [] });
  return segments;
}

export function segmentsToDoc(segments: Segment[]): RichDoc {
  const blocks: RichBlock[] = [];
  for (const seg of segments) {
    if (seg.kind === 'table') blocks.push(seg.block);
    else blocks.push(...seg.blocks);
  }
  return { v: 1, blocks };
}

export function emptyTableBlock(): RichTableBlock {
  return {
    type: 'table',
    headerRow: true,
    rows: [
      [[{ text: '' }], [{ text: '' }]],
      [[{ text: '' }], [{ text: '' }]],
    ],
  };
}

export function newSegmentId(): string {
  return newId();
}
