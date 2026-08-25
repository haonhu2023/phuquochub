import { isCanonicalDecimalString } from './canonical-decimal-string';

// Trích xuất (2026-08-25, Slice 0.5D2) từ approval-evidence.contract.ts — xem comment trong
// canonical-decimal-string.ts. Trước đây hành vi này chỉ được kiểm GIÁN TIẾP qua
// approval-evidence.contract.spec.ts (mục "D. Numeric ID canonical form", gọi
// validateApprovalEvidence() rồi soi các field ID). File này kiểm TRỰC TIẾP hàm thuần, không qua
// bất kỳ contract nào — cùng các trường hợp đã ghi trong comment gốc, cộng test hình dạng bổ sung.
describe('isCanonicalDecimalString', () => {
  it('"1" (một chữ số) → true', () => {
    expect(isCanonicalDecimalString('1')).toBe(true);
  });

  it('ID lớn hơn Number.MAX_SAFE_INTEGER dưới dạng chuỗi thập phân → true (không parse thành number)', () => {
    const huge = '9007199254740993'; // 2^53 + 1
    expect(isCanonicalDecimalString(huge)).toBe(true);
    const evenHuger = '99999999999999999999999999'; // vượt xa 2^53
    expect(isCanonicalDecimalString(evenHuger)).toBe(true);
  });

  it.each(['0', '01', '+1', '-1', '1.0', '1e3', ' 1', '1 ', '', 'abc'])(
    '"%s" → false',
    (bad) => {
      expect(isCanonicalDecimalString(bad)).toBe(false);
    },
  );

  it('ký tự Unicode digit (Ả Rập-Ấn Độ ١٢٣, fullwidth １２３, Thái ๑๒๓) → false (regex chỉ ASCII)', () => {
    for (const bad of ['١٢٣', '１２３', '๑๒๓']) {
      expect(isCanonicalDecimalString(bad)).toBe(false);
    }
  });

  it('non-string (number/null/undefined/object/array/boolean) → false', () => {
    for (const bad of [123, null, undefined, {}, [], true, false]) {
      expect(isCanonicalDecimalString(bad)).toBe(false);
    }
  });

  it('chuỗi thập phân dài hợp lệ (không leading zero) → true', () => {
    expect(isCanonicalDecimalString('123456789012345678901234567890')).toBe(true);
  });

  it('không mutate input — chỉ trả boolean', () => {
    const value = '123';
    const result = isCanonicalDecimalString(value);
    expect(result).toBe(true);
    expect(value).toBe('123');
  });
});
