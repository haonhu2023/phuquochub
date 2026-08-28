import { canDisclosePrice, redactUntrustedPriceRange } from './price-trust';

describe('canDisclosePrice', () => {
  it.each(['verified', 'official', 'community_verified'])('%s → true (trạng thái tin cậy)', (status) => {
    expect(canDisclosePrice(status)).toBe(true);
  });

  it.each(['pending', 'expired', 'rejected'])('%s → false (chưa/không còn tin cậy)', (status) => {
    expect(canDisclosePrice(status)).toBe(false);
  });

  it.each([null, undefined, '', 'some-unknown-status', 123, {}])(
    'giá trị lạ/thiếu (%p) → false (fail-closed)',
    (status) => {
      expect(canDisclosePrice(status)).toBe(false);
    },
  );
});

describe('redactUntrustedPriceRange', () => {
  it('trusted → giữ nguyên object (cùng reference, không tạo bản sao không cần thiết)', () => {
    const item = { price_range: 'high', verification_status: 'verified' };
    expect(redactUntrustedPriceRange(item)).toBe(item);
  });

  it.each(['pending', 'expired', 'rejected'])('%s → price_range redact thành null', (status) => {
    const item = { price_range: 'high', verification_status: status };
    expect(redactUntrustedPriceRange(item)).toEqual({ price_range: null, verification_status: status });
  });

  it('không đổi các field khác của object', () => {
    const item = { id: 'p1', name: 'X', price_range: 'mid', verification_status: 'pending' };
    expect(redactUntrustedPriceRange(item)).toEqual({ id: 'p1', name: 'X', price_range: null, verification_status: 'pending' });
  });

  it('price_range vốn đã null + untrusted → vẫn null (không có gì để bịa)', () => {
    const item = { price_range: null, verification_status: 'pending' };
    expect(redactUntrustedPriceRange(item)).toEqual({ price_range: null, verification_status: 'pending' });
  });
});
