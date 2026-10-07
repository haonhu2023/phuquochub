import { formatSalary } from './salary';

function base() {
  return {
    salary_min: null,
    salary_max: null,
    salary_negotiable: false,
    salary_currency: null,
    salary_period: null,
  } as { salary_min: number | null; salary_max: number | null; salary_negotiable: boolean; salary_currency: string | null; salary_period: 'hour' | 'day' | 'month' | null };
}

describe('formatSalary', () => {
  it('không có số tiền, không thoả thuận → "chưa rõ mức lương" (KHÔNG suy ra 0/miễn phí)', () => {
    expect(formatSalary(base())).toBe('Chưa rõ mức lương');
  });

  it('salary_negotiable=true, không có số tiền → "Thoả thuận" (khác "chưa rõ")', () => {
    expect(formatSalary({ ...base(), salary_negotiable: true })).toBe('Thoả thuận');
  });

  it('một mức duy nhất + currency + period', () => {
    expect(
      formatSalary({ ...base(), salary_min: 8000000, salary_max: 8000000, salary_currency: 'VND', salary_period: 'month' }),
    ).toBe('8.000.000 VND/tháng');
  });

  it('khoảng min-max khác nhau → hiện cả hai, nối bằng –', () => {
    expect(
      formatSalary({ ...base(), salary_min: 5000000, salary_max: 8000000, salary_currency: 'VND', salary_period: 'month' }),
    ).toBe('5.000.000–8.000.000 VND/tháng');
  });

  it('có số tiền nhưng thiếu salary_period → ghi rõ "(chưa rõ kỳ lương)", KHÔNG suy đoán /tháng', () => {
    expect(formatSalary({ ...base(), salary_min: 200000, salary_max: 200000, salary_currency: 'VND' })).toBe(
      '200.000 VND (chưa rõ kỳ lương)',
    );
  });

  it('locale en: nhãn khác nhưng cùng nguyên tắc không suy đoán', () => {
    expect(formatSalary(base(), 'en')).toBe('Salary not specified');
    expect(formatSalary({ ...base(), salary_negotiable: true }, 'en')).toBe('Negotiable');
    expect(
      formatSalary({ ...base(), salary_min: 8000000, salary_max: 8000000, salary_currency: 'VND', salary_period: 'month' }, 'en'),
    ).toBe('8.000.000 VND/mo');
  });
});
