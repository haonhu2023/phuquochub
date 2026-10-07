import { REAL_ESTATE_RENT_PERIOD_LABELS, type RealEstateListingBaseView } from './types';

const BASIS_SUFFIX_VI: Record<'total' | 'per_sqm', string> = { total: '(giá tổng)', per_sqm: '/m²' };

function formatAmount(n: number): string {
  return n.toLocaleString('vi-VN');
}

const PERIOD_LABEL_EN: Record<'month' | 'year', string> = { month: '/mo', year: '/yr' };
const BASIS_LABEL_EN: Record<'total' | 'per_sqm', string> = { total: 'total', per_sqm: '/m²' };

// Không BAO GIỜ suy ra giá khi thiếu — trả "chưa rõ giá" rõ ràng, cùng nguyên tắc job_listings.
export function formatRealEstatePrice(
  listing: Pick<
    RealEstateListingBaseView,
    'price' | 'price_currency' | 'transaction_type' | 'rent_period' | 'sale_price_basis'
  > & { transaction_type: 'rent' | 'sale' },
  locale: 'vi' | 'en' = 'vi',
): string {
  const { price, price_currency, transaction_type, rent_period, sale_price_basis } = listing;

  if (price == null) {
    return locale === 'en' ? 'Price not specified' : 'Chưa rõ giá';
  }

  const amount = formatAmount(price);
  const currency = price_currency ?? (locale === 'en' ? '(currency unknown)' : '(chưa rõ đơn vị tiền)');

  if (transaction_type === 'rent') {
    const period = rent_period
      ? locale === 'en'
        ? PERIOD_LABEL_EN[rent_period]
        : REAL_ESTATE_RENT_PERIOD_LABELS[rent_period]
      : locale === 'en'
        ? ' (period unknown)'
        : ' (chưa rõ kỳ hạn)';
    return `${amount} ${currency}${period}`;
  }

  const basis = sale_price_basis
    ? locale === 'en'
      ? BASIS_LABEL_EN[sale_price_basis]
      : BASIS_SUFFIX_VI[sale_price_basis]
    : locale === 'en'
      ? '(basis unknown)'
      : '(chưa rõ theo tổng hay theo m²)';
  return `${amount} ${currency} ${basis}`;
}
