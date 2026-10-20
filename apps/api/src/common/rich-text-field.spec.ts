import { RichDoc } from '@phuquochub/shared-types';
import { applyRichTextField, hashPlainTextForRichDoc, isRichDocCurrent, serveRichDoc, RichTextFieldAccessors } from './rich-text-field';

interface TestEntity {
  plain: string | null;
  rich: RichDoc | null;
  richHash: string | null;
}

function entity(overrides: Partial<TestEntity> = {}): TestEntity {
  return { plain: null, rich: null, richHash: null, ...overrides };
}

const accessors: RichTextFieldAccessors<TestEntity> = {
  setPlain: (e, v) => (e.plain = v),
  getRich: (e) => e.rich,
  setRich: (e, v) => (e.rich = v),
  setRichHash: (e, v) => (e.richHash = v),
};

const doc = (text: string, bold = false): RichDoc => ({
  v: 1,
  blocks: [{ type: 'p', runs: [{ text, ...(bold ? { bold: true } : {}) }] }],
});

describe('applyRichTextField', () => {
  it('dtoRich là object hợp lệ → ghi rich + plain (flatten) + hash(plain)', () => {
    const e = entity();
    applyRichTextField(e, accessors, doc('Nội dung mới', true), undefined, 'x', 100000);
    expect(e.rich).toEqual(doc('Nội dung mới', true));
    expect(e.plain).toBe('Nội dung mới');
    expect(e.richHash).toBe(hashPlainTextForRichDoc('Nội dung mới'));
  });

  // Bug thật phát hiện qua rà bảo mật (20/10/2026): validateRichDoc() chỉ giới hạn kích thước CHUNG
  // (200k ký tự), không biết giới hạn RIÊNG của cột plain đích — một RichDoc hợp lệ vẫn có thể
  // flatten ra chuỗi dài hơn cột plain cho phép, trước đây vượt qua mọi kiểm tra ứng dụng rồi vỡ ở
  // Postgres thành lỗi driver thô (500). Test này khoá đúng: vượt maxPlainLength → 400 sạch, KHÔNG
  // chạm DB, entity không bị sửa dở dang.
  it('dtoRich flatten ra chuỗi dài hơn maxPlainLength → BadRequestException, entity không bị sửa', () => {
    const e = entity({ plain: 'cũ', rich: doc('cũ'), richHash: hashPlainTextForRichDoc('cũ') });
    const longDoc = doc('a'.repeat(50));
    expect(() => applyRichTextField(e, accessors, longDoc, undefined, 'x', 10)).toThrow(/x:.*50.*vượt quá.*10/);
    expect(e.plain).toBe('cũ');
    expect(e.rich).toEqual(doc('cũ'));
    expect(e.richHash).toBe(hashPlainTextForRichDoc('cũ'));
  });

  it('dtoRich không hợp lệ → BadRequestException, entity không bị sửa', () => {
    const e = entity({ plain: 'cũ', rich: doc('cũ'), richHash: hashPlainTextForRichDoc('cũ') });
    expect(() => applyRichTextField(e, accessors, { blocks: [] } as never, undefined, 'x', 100000)).toThrow(/x:/);
    expect(e.plain).toBe('cũ'); // không đổi vì throw trước khi gán
  });

  it('dtoRich=null tường minh → xoá cả ba (rich/hash/plain)', () => {
    const e = entity({ plain: 'cũ', rich: doc('cũ'), richHash: hashPlainTextForRichDoc('cũ') });
    applyRichTextField(e, accessors, null, undefined, 'x', 100000);
    expect(e.rich).toBeNull();
    expect(e.richHash).toBeNull();
    expect(e.plain).toBeNull();
  });

  it('dtoRich vắng mặt, round-trip plain khớp bản flatten hiện tại → giữ nguyên rich+hash', () => {
    const hash = hashPlainTextForRichDoc('Nội dung');
    const e = entity({ plain: 'Nội dung', rich: doc('Nội dung'), richHash: hash });
    applyRichTextField(e, accessors, undefined, 'Nội dung', 'x', 100000);
    expect(e.rich).toEqual(doc('Nội dung'));
    expect(e.richHash).toBe(hash);
  });

  it('dtoRich vắng mặt, plain mới KHÁC bản flatten → demote (xoá rich+hash), ghi plain mới', () => {
    const e = entity({ plain: 'Nội dung cũ', rich: doc('Nội dung cũ'), richHash: hashPlainTextForRichDoc('Nội dung cũ') });
    applyRichTextField(e, accessors, undefined, 'Nội dung hoàn toàn khác', 'x', 100000);
    expect(e.rich).toBeNull();
    expect(e.richHash).toBeNull();
    expect(e.plain).toBe('Nội dung hoàn toàn khác');
  });

  it('chưa từng có rich, dtoRich vắng mặt → chỉ ghi plain, rich/hash vẫn null tường minh (không để undefined)', () => {
    const e = entity();
    applyRichTextField(e, accessors, undefined, 'Chỉ chữ thường', 'x', 100000);
    expect(e.rich).toBeNull();
    expect(e.richHash).toBeNull();
    expect(e.plain).toBe('Chỉ chữ thường');
  });
});

describe('isRichDocCurrent / serveRichDoc — cơ chế đóng rủi ro rollback', () => {
  it('hash khớp plain hiện tại → current, serve rich', () => {
    const hash = hashPlainTextForRichDoc('Khớp');
    expect(isRichDocCurrent('Khớp', hash)).toBe(true);
    expect(serveRichDoc('Khớp', doc('Khớp'), hash)).toEqual(doc('Khớp'));
  });

  it('hash KHÔNG khớp plain hiện tại → không current, serveRichDoc trả null (không phục vụ rich lỗi thời)', () => {
    const hashOfOld = hashPlainTextForRichDoc('Bản cũ');
    expect(isRichDocCurrent('Bản MỚI do client khác ghi', hashOfOld)).toBe(false);
    expect(serveRichDoc('Bản MỚI do client khác ghi', doc('Bản cũ'), hashOfOld)).toBeNull();
  });

  it('storedHash null (chưa từng có rich) → không current dù plain có giá trị', () => {
    expect(isRichDocCurrent('Bất kỳ', null)).toBe(false);
  });

  it('rich=null → serveRichDoc luôn null bất kể hash', () => {
    expect(serveRichDoc('Bất kỳ', null, hashPlainTextForRichDoc('Bất kỳ'))).toBeNull();
  });

  // Chuỗi rủi ro rollback owner yêu cầu kiểm ĐÚNG, mô phỏng bằng entity thuần (không DB thật — DB
  // thật được test trong rich-text-field-rollback.e2e-spec.ts với migration/TypeORM thật):
  // app mới tạo RichDoc → rollback app (client KHÔNG gọi applyRichTextField, chỉ set .plain trực
  // tiếp như app cũ sẽ làm) → thao tác hợp lệ trong lúc rollback → nâng lại app mới (đọc qua
  // serveRichDoc) → nội dung public đúng (không lộ rich cũ).
  it('chuỗi đầy đủ: tạo rich → rollback (app cũ sửa plain trực tiếp) → đọc lại qua serveRichDoc → KHÔNG phục vụ rich cũ, phục vụ đúng plain mới', () => {
    const e = entity();
    // 1. App mới tạo RichDoc.
    applyRichTextField(e, accessors, doc('Nội dung ban đầu', true), undefined, 'x', 100000);
    expect(serveRichDoc(e.plain, e.rich, e.richHash)).toEqual(doc('Nội dung ban đầu', true));

    // 2. Rollback app — app CŨ không biết rich/hash, chỉ UPDATE cột plain (mô phỏng đúng TypeORM
    //    entity cũ: property `rich`/`richHash` không tồn tại trên class cũ nên không nằm trong SQL
    //    UPDATE sinh ra — ở đây mô phỏng bằng cách gán TRỰC TIẾP `.plain`, bỏ qua applyRichTextField).
    e.plain = 'Nội dung do app cũ sửa trong lúc rollback';

    // 3. Thao tác khác hợp lệ trong lúc rollback (vd đổi một trường không liên quan) không ảnh hưởng.

    // 4. Nâng lại app mới — đọc qua serveRichDoc() PHẢI phát hiện lệch, không phục vụ rich cũ.
    const served = serveRichDoc(e.plain, e.rich, e.richHash);
    expect(served).toBeNull();
    expect(e.plain).toBe('Nội dung do app cũ sửa trong lúc rollback'); // plain KHÔNG mất, vẫn đúng

    // 5. Nếu sau đó chủ tin sửa tiếp qua app mới (dù chỉ sửa plain, không chạm rich) — demote dọn
    //    sạch rich/hash đã lỗi thời luôn, không chỉ "ẩn khi đọc" mà còn "dọn khi ghi".
    applyRichTextField(e, accessors, undefined, e.plain, 'x', 100000);
    expect(e.rich).toBeNull();
    expect(e.richHash).toBeNull();
  });
});
