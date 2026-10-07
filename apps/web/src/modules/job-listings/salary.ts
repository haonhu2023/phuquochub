import { JOB_LISTING_SALARY_PERIOD_LABELS, type JobListingBaseView } from './types';

const PERIOD_LABEL_EN: Record<NonNullable<JobListingBaseView['salary_period']>, string> = {
  hour: '/hr',
  day: '/day',
  month: '/mo',
};

function formatAmount(n: number): string {
  return n.toLocaleString('vi-VN');
}

// Không BAO GIỜ suy ra "miễn phí"/0 khi thiếu dữ liệu, không suy ra kỳ lương khi `salary_period`
// null — trả về chuỗi "chưa rõ" rõ ràng, cùng nguyên tắc đã áp cho giá phòng/giá món. Thoả thuận
// (`salary_negotiable`) là một giá trị CÓ Ý NGHĨA riêng, không phải cách diễn đạt khác của "chưa rõ".
export function formatSalary(
  listing: Pick<JobListingBaseView, 'salary_min' | 'salary_max' | 'salary_negotiable' | 'salary_currency' | 'salary_period'>,
  locale: 'vi' | 'en' = 'vi',
): string {
  const { salary_min, salary_max, salary_negotiable, salary_currency, salary_period } = listing;

  if (salary_min == null && salary_max == null) {
    if (salary_negotiable) return locale === 'en' ? 'Negotiable' : 'Thoả thuận';
    return locale === 'en' ? 'Salary not specified' : 'Chưa rõ mức lương';
  }

  const amount =
    salary_min != null && salary_max != null && salary_min !== salary_max
      ? `${formatAmount(salary_min)}–${formatAmount(salary_max)}`
      : formatAmount(salary_min ?? salary_max ?? 0);

  const currency = salary_currency ?? (locale === 'en' ? '(currency unknown)' : '(chưa rõ đơn vị tiền)');
  const period = salary_period
    ? locale === 'en'
      ? PERIOD_LABEL_EN[salary_period]
      : JOB_LISTING_SALARY_PERIOD_LABELS[salary_period]
    : locale === 'en'
      ? ' (period unknown)'
      : ' (chưa rõ kỳ lương)';

  return `${amount} ${currency}${period}`;
}
