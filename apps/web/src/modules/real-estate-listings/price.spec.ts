import { formatRealEstatePrice } from './price';

function base(transaction_type: 'rent' | 'sale') {
  return {
    price: null,
    price_currency: null,
    transaction_type,
    rent_period: null,
    sale_price_basis: null,
  } as {
    price: number | null;
    price_currency: string | null;
    transaction_type: 'rent' | 'sale';
    rent_period: 'month' | 'year' | null;
    sale_price_basis: 'total' | 'per_sqm' | null;
  };
}

describe('formatRealEstatePrice', () => {
  it('thiếu giá → "Chưa rõ giá" (KHÔNG suy ra 0đ/miễn phí)', () => {
    expect(formatRealEstatePrice(base('rent'))).toBe('Chưa rõ giá');
  });

  it('thuê: có giá + currency + rent_period', () => {
    expect(
      formatRealEstatePrice({ ...base('rent'), price: 3000000, price_currency: 'VND', rent_period: 'month' }),
    ).toBe('3.000.000 VND/tháng');
  });

  it('thuê: có giá nhưng thiếu rent_period → ghi rõ "(chưa rõ kỳ hạn)", không suy đoán /tháng', () => {
    expect(formatRealEstatePrice({ ...base('rent'), price: 3000000, price_currency: 'VND' })).toBe(
      '3.000.000 VND (chưa rõ kỳ hạn)',
    );
  });

  it('bán: có giá + sale_price_basis=per_sqm', () => {
    expect(
      formatRealEstatePrice({ ...base('sale'), price: 15000000, price_currency: 'VND', sale_price_basis: 'per_sqm' }),
    ).toBe('15.000.000 VND /m²');
  });

  it('bán: có giá nhưng thiếu sale_price_basis → ghi rõ "chưa rõ theo tổng hay theo m²"', () => {
    expect(formatRealEstatePrice({ ...base('sale'), price: 2000000000, price_currency: 'VND' })).toBe(
      '2.000.000.000 VND (chưa rõ theo tổng hay theo m²)',
    );
  });

  it('locale en: nhãn khác nhưng cùng nguyên tắc không suy đoán', () => {
    expect(formatRealEstatePrice(base('sale'), 'en')).toBe('Price not specified');
    expect(
      formatRealEstatePrice({ ...base('rent'), price: 3000000, price_currency: 'VND', rent_period: 'month' }, 'en'),
    ).toBe('3.000.000 VND/mo');
  });
});
