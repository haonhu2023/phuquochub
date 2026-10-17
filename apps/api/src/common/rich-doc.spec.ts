import {
  RICH_DOC_LIMITS,
  RichDoc,
  RichDocValidationError,
  flattenRichDocToPlainText,
  validateRichDoc,
} from '@phuquochub/shared-types';

// Gói D — validator dùng CHUNG apps/api + apps/web (nguồn: packages/shared-types/src/rich-doc.ts).
// Test ở đây vì apps/api đã có jest sẵn (shared-types chưa có runner riêng).

describe('validateRichDoc', () => {
  it('chấp nhận RichDoc hợp lệ tối thiểu, trả về bản đã làm sạch', () => {
    const doc = validateRichDoc({
      v: 1,
      blocks: [{ type: 'p', runs: [{ text: 'Xin chào', bold: true }] }],
    });
    expect(doc).toEqual({ v: 1, blocks: [{ type: 'p', runs: [{ text: 'Xin chào', bold: true }] }] });
  });

  it('bỏ key lạ không khai báo (allowlist, không spread input gốc)', () => {
    const doc = validateRichDoc({
      v: 1,
      blocks: [{ type: 'p', runs: [{ text: 'a', evil: 'x', __proto__: { polluted: true } }], extra: 'nope' }],
      malicious: true,
    } as unknown);
    expect(doc).toEqual({ v: 1, blocks: [{ type: 'p', runs: [{ text: 'a' }] }] });
    expect((doc as unknown as Record<string, unknown>).malicious).toBeUndefined();
  });

  it('chấp nhận cả 3 loại khối: đoạn văn/tiêu đề, danh sách, bảng có hàng tiêu đề', () => {
    const doc = validateRichDoc({
      v: 1,
      blocks: [
        { type: 'heading2', runs: [{ text: 'Mô tả' }] },
        { type: 'list', ordered: true, items: [[{ text: 'Mục 1' }], [{ text: 'Mục 2' }]] },
        {
          type: 'table',
          headerRow: true,
          caption: 'Bảng giá',
          rows: [
            [[{ text: 'Loại phòng' }], [{ text: 'Giá' }]],
            [[{ text: 'Phòng đơn' }], [{ text: '200.000' }]],
          ],
        },
      ],
    });
    expect(doc.blocks).toHaveLength(3);
  });

  it('chấp nhận href https/http/mailto/tel', () => {
    for (const href of ['https://example.com', 'http://example.com', 'mailto:a@b.com', 'tel:+84900000000']) {
      expect(() => validateRichDoc({ v: 1, blocks: [{ type: 'p', runs: [{ text: 'x', href }] }] })).not.toThrow();
    }
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)', 'file:///etc/passwd'])(
    'từ chối href scheme nguy hiểm: %s',
    (href) => {
      expect(() => validateRichDoc({ v: 1, blocks: [{ type: 'p', runs: [{ text: 'x', href }] }] })).toThrow(
        RichDocValidationError,
      );
    },
  );

  it('từ chối href không parse được', () => {
    expect(() => validateRichDoc({ v: 1, blocks: [{ type: 'p', runs: [{ text: 'x', href: 'not a url' }] }] })).toThrow(
      RichDocValidationError,
    );
  });

  it('từ chối sai version', () => {
    expect(() => validateRichDoc({ v: 2, blocks: [] })).toThrow(/phiên bản/);
  });

  it('từ chối loại khối không được hỗ trợ', () => {
    expect(() => validateRichDoc({ v: 1, blocks: [{ type: 'script', runs: [] }] })).toThrow(/không được hỗ trợ/);
  });

  it('từ chối tài liệu quá lớn (vượt MAX_DOC_CHARS)', () => {
    const hugeText = 'a'.repeat(RICH_DOC_LIMITS.MAX_DOC_CHARS + 1);
    expect(() => validateRichDoc({ v: 1, blocks: [{ type: 'p', runs: [{ text: hugeText }] }] })).toThrow(/quá lớn/);
  });

  it('từ chối quá số khối tối đa', () => {
    const blocks = Array.from({ length: RICH_DOC_LIMITS.MAX_BLOCKS + 1 }, () => ({ type: 'p' as const, runs: [] }));
    expect(() => validateRichDoc({ v: 1, blocks })).toThrow(/quá nhiều khối/);
  });

  it('từ chối bảng quá nhiều hàng', () => {
    const rows = Array.from({ length: RICH_DOC_LIMITS.MAX_TABLE_ROWS + 1 }, () => [[{ text: 'x' }]]);
    expect(() => validateRichDoc({ v: 1, blocks: [{ type: 'table', headerRow: false, rows }] })).toThrow(/quá nhiều hàng/);
  });

  it('từ chối bảng quá nhiều cột', () => {
    const row = Array.from({ length: RICH_DOC_LIMITS.MAX_TABLE_COLS + 1 }, () => [{ text: 'x' }]);
    expect(() => validateRichDoc({ v: 1, blocks: [{ type: 'table', headerRow: false, rows: [row] }] })).toThrow(/quá nhiều cột/);
  });

  it('từ chối bảng răng cưa (các hàng khác số cột nhau)', () => {
    const rows = [[[{ text: 'a' }], [{ text: 'b' }]], [[{ text: 'c' }]]];
    expect(() => validateRichDoc({ v: 1, blocks: [{ type: 'table', headerRow: false, rows }] })).toThrow(/cùng số cột/);
  });

  it('từ chối danh sách quá nhiều mục', () => {
    const items = Array.from({ length: RICH_DOC_LIMITS.MAX_LIST_ITEMS + 1 }, () => [{ text: 'x' }]);
    expect(() => validateRichDoc({ v: 1, blocks: [{ type: 'list', ordered: false, items }] })).toThrow(/quá nhiều mục/);
  });

  it('từ chối run.text không phải chuỗi, run.bold không phải boolean', () => {
    expect(() => validateRichDoc({ v: 1, blocks: [{ type: 'p', runs: [{ text: 123 }] }] })).toThrow(RichDocValidationError);
    expect(() => validateRichDoc({ v: 1, blocks: [{ type: 'p', runs: [{ text: 'x', bold: 'yes' }] }] })).toThrow(
      RichDocValidationError,
    );
  });

  it('từ chối input không phải object / blocks không phải mảng', () => {
    expect(() => validateRichDoc('hello')).toThrow(RichDocValidationError);
    expect(() => validateRichDoc({ v: 1, blocks: 'nope' })).toThrow(RichDocValidationError);
    expect(() => validateRichDoc(null)).toThrow(RichDocValidationError);
  });
});

describe('flattenRichDocToPlainText', () => {
  it('nối đoạn văn cách nhau bằng dòng trống, giữ nguyên thứ tự', () => {
    const doc: RichDoc = {
      v: 1,
      blocks: [
        { type: 'p', runs: [{ text: 'Đoạn một' }] },
        { type: 'p', runs: [{ text: 'Đoạn hai' }] },
      ],
    };
    expect(flattenRichDocToPlainText(doc)).toBe('Đoạn một\n\nĐoạn hai');
  });

  it('đậm/nghiêng KHÔNG xuất hiện trong plain text (chỉ ảnh hưởng trình bày, không ảnh hưởng hash)', () => {
    const plain = flattenRichDocToPlainText({ v: 1, blocks: [{ type: 'p', runs: [{ text: 'quan trọng', bold: true }] }] });
    const noBold = flattenRichDocToPlainText({ v: 1, blocks: [{ type: 'p', runs: [{ text: 'quan trọng' }] }] });
    expect(plain).toBe(noBold);
    expect(plain).toBe('quan trọng');
  });

  it('href được nối vào plain text — đổi đích liên kết ĐỔI kết quả flatten (ảnh hưởng hash)', () => {
    const a = flattenRichDocToPlainText({ v: 1, blocks: [{ type: 'p', runs: [{ text: 'Xem thêm', href: 'https://a.example' }] }] });
    const b = flattenRichDocToPlainText({ v: 1, blocks: [{ type: 'p', runs: [{ text: 'Xem thêm', href: 'https://b.example' }] }] });
    expect(a).not.toBe(b);
  });

  it('danh sách: mỗi mục một dòng', () => {
    const text = flattenRichDocToPlainText({
      v: 1,
      blocks: [{ type: 'list', ordered: false, items: [[{ text: 'Một' }], [{ text: 'Hai' }]] }],
    });
    expect(text).toBe('Một\nHai');
  });

  it('bảng: caption rồi mỗi hàng một dòng, ô cách nhau bằng tab — đổi nội dung ô ĐỔI kết quả', () => {
    const makeTable = (cell: string) =>
      flattenRichDocToPlainText({
        v: 1,
        blocks: [
          {
            type: 'table',
            headerRow: true,
            caption: 'Bảng giá',
            rows: [[[{ text: 'Phòng' }], [{ text: cell }]]],
          },
        ],
      });
    expect(makeTable('200.000')).toBe('Bảng giá\nPhòng\t200.000');
    expect(makeTable('200.000')).not.toBe(makeTable('250.000'));
  });

  it('không lộ markup/JSON — kết quả không chứa dấu ngoặc nhọn/vuông hay key JSON', () => {
    const text = flattenRichDocToPlainText({
      v: 1,
      blocks: [{ type: 'p', runs: [{ text: 'Giá tốt', bold: true, href: 'https://example.com' }] }],
    });
    expect(text).not.toMatch(/[{}[\]]/);
    expect(text).not.toMatch(/"(text|bold|href|type)"/);
  });
});
