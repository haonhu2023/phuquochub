import type { RichDoc } from '@phuquochub/shared-types';
import { docToSegments, segmentsToDoc, emptyTableBlock } from './segments';

describe('segments: tách/ghép RichDoc.blocks thành đoạn văn xuôi + bảng', () => {
  it('tài liệu chỉ có văn xuôi → một segment duy nhất', () => {
    const doc: RichDoc = { v: 1, blocks: [{ type: 'p', runs: [{ text: 'a' }] }, { type: 'heading2', runs: [{ text: 'b' }] }] };
    const segs = docToSegments(doc);
    expect(segs).toHaveLength(1);
    expect(segs[0].kind).toBe('prose');
  });

  it('bảng xen giữa hai đoạn văn xuôi → 3 segment theo đúng thứ tự', () => {
    const doc: RichDoc = {
      v: 1,
      blocks: [
        { type: 'p', runs: [{ text: 'trước' }] },
        { type: 'table', headerRow: false, rows: [[[{ text: 'x' }]]] },
        { type: 'p', runs: [{ text: 'sau' }] },
      ],
    };
    const segs = docToSegments(doc);
    expect(segs.map((s) => s.kind)).toEqual(['prose', 'table', 'prose']);
  });

  it('hai bảng liên tiếp (không văn xuôi ở giữa) → hai segment bảng tách biệt, không gộp nhầm', () => {
    const doc: RichDoc = {
      v: 1,
      blocks: [
        { type: 'table', headerRow: false, rows: [[[{ text: '1' }]]] },
        { type: 'table', headerRow: false, rows: [[[{ text: '2' }]]] },
      ],
    };
    const segs = docToSegments(doc);
    expect(segs.map((s) => s.kind)).toEqual(['table', 'table']);
  });

  it('tài liệu rỗng → một segment văn xuôi rỗng (có chỗ cho Tiptap gắn vào)', () => {
    const segs = docToSegments({ v: 1, blocks: [] });
    expect(segs).toEqual([{ kind: 'prose', id: expect.any(String), blocks: [] }]);
  });

  it('docToSegments rồi segmentsToDoc round-trip giữ nguyên blocks (bỏ qua id nội bộ)', () => {
    const doc: RichDoc = {
      v: 1,
      blocks: [
        { type: 'p', runs: [{ text: 'trước' }] },
        { type: 'table', headerRow: true, caption: 'Giá', rows: [[[{ text: 'x' }]]] },
        { type: 'heading2', runs: [{ text: 'sau' }] },
      ],
    };
    expect(segmentsToDoc(docToSegments(doc))).toEqual(doc);
  });

  it('emptyTableBlock() tạo bảng 2x2 hợp lệ, có hàng tiêu đề mặc định', () => {
    const t = emptyTableBlock();
    expect(t.headerRow).toBe(true);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0]).toHaveLength(2);
  });
});
