import { proseBlocksToTiptapJSON, tiptapJSONToProseBlocks, type ProseBlock } from './tiptap-bridge';

describe('tiptap-bridge: RichDoc (ProseBlock[]) ↔ Tiptap JSONContent', () => {
  it('round-trip đoạn văn đơn giản', () => {
    const blocks: ProseBlock[] = [{ type: 'p', runs: [{ text: 'Xin chào' }] }];
    const doc = proseBlocksToTiptapJSON(blocks);
    expect(tiptapJSONToProseBlocks(doc)).toEqual(blocks);
  });

  it('round-trip đậm/nghiêng/link giữ nguyên marks', () => {
    const blocks: ProseBlock[] = [
      {
        type: 'p',
        runs: [
          { text: 'chữ thường ' },
          { text: 'đậm', bold: true },
          { text: ' và ' },
          { text: 'nghiêng', italic: true },
          { text: ' và ' },
          { text: 'liên kết', href: 'https://example.com' },
        ],
      },
    ];
    expect(tiptapJSONToProseBlocks(proseBlocksToTiptapJSON(blocks))).toEqual(blocks);
  });

  it('round-trip tiêu đề phụ (heading2/heading3) và trích dẫn', () => {
    const blocks: ProseBlock[] = [
      { type: 'heading2', runs: [{ text: 'Tiêu đề lớn' }] },
      { type: 'heading3', runs: [{ text: 'Tiêu đề nhỏ' }] },
      { type: 'blockquote', runs: [{ text: 'Trích dẫn' }] },
    ];
    expect(tiptapJSONToProseBlocks(proseBlocksToTiptapJSON(blocks))).toEqual(blocks);
  });

  it('round-trip danh sách không số và có số', () => {
    const blocks: ProseBlock[] = [
      { type: 'list', ordered: false, items: [[{ text: 'Một' }], [{ text: 'Hai' }]] },
      { type: 'list', ordered: true, items: [[{ text: 'Bước 1' }], [{ text: 'Bước 2' }]] },
    ];
    expect(tiptapJSONToProseBlocks(proseBlocksToTiptapJSON(blocks))).toEqual(blocks);
  });

  it('round-trip nhiều đoạn liên tiếp, giữ đúng thứ tự', () => {
    const blocks: ProseBlock[] = [
      { type: 'p', runs: [{ text: 'Đoạn 1' }] },
      { type: 'heading2', runs: [{ text: 'Mục' }] },
      { type: 'p', runs: [{ text: 'Đoạn 2' }] },
      { type: 'list', ordered: false, items: [[{ text: 'a' }]] },
    ];
    expect(tiptapJSONToProseBlocks(proseBlocksToTiptapJSON(blocks))).toEqual(blocks);
  });

  it('mảng rỗng → tài liệu Tiptap tối thiểu hợp lệ (một đoạn rỗng), đọc ngược lại ra mảng rỗng', () => {
    const doc = proseBlocksToTiptapJSON([]);
    expect(doc).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(tiptapJSONToProseBlocks(doc)).toEqual([]);
  });

  it('đoạn văn rỗng Ở GIỮA tài liệu được GIỮ (ngắt đoạn có chủ ý), chỉ bỏ ở đầu/cuối', () => {
    const blocks: ProseBlock[] = [
      { type: 'p', runs: [] },
      { type: 'p', runs: [{ text: 'Giữa' }] },
      { type: 'p', runs: [] },
      { type: 'p', runs: [{ text: 'Cuối' }] },
      { type: 'p', runs: [] },
    ];
    const result = tiptapJSONToProseBlocks(proseBlocksToTiptapJSON(blocks));
    // Bỏ đoạn rỗng ĐẦU (vị trí 0) và CUỐI (vị trí 4) của input — đoạn rỗng Ở GIỮA (vị trí 2) giữ
    // nguyên: còn lại 'Giữa' / rỗng / 'Cuối'.
    expect(result.map((b) => (b.type === 'p' ? b.runs.length : -1))).toEqual([1, 0, 1]);
  });

  it('chữ rỗng hoàn toàn (không mark, không href) không tạo run thừa khi round-trip', () => {
    const blocks: ProseBlock[] = [{ type: 'p', runs: [{ text: 'A' }, { text: '' }, { text: 'B' }] }];
    const result = tiptapJSONToProseBlocks(proseBlocksToTiptapJSON(blocks));
    expect(result).toEqual([{ type: 'p', runs: [{ text: 'A' }, { text: 'B' }] }]);
  });
});
