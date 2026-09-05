/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchFilters } from './SearchFilters';
import type { Category } from '@/modules/categories/api/categories.api';
import { LocaleProvider } from '@/lib/LocaleContext';

const push = jest.fn();
let searchParamsString = '';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(searchParamsString),
}));

const CATEGORIES: Category[] = [
  { id: 'c1', slug: 'hotel', name_vi: 'Khách sạn', name_en: 'Hotel', icon: null, parent_id: null },
  {
    id: 'c2',
    slug: 'restaurant',
    name_vi: 'Nhà hàng',
    name_en: 'Restaurant',
    icon: null,
    parent_id: null,
  },
];

describe('SearchFilters', () => {
  beforeEach(() => {
    push.mockClear();
    searchParamsString = '';
  });

  it('renders the result count', () => {
    render(<SearchFilters total={42} categories={CATEGORIES} />);
    expect(screen.getByText('42 kết quả')).toBeInTheDocument();
  });

  it('renders all categories as options', () => {
    render(<SearchFilters total={0} categories={CATEGORIES} />);
    expect(screen.getByRole('option', { name: 'Khách sạn' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Nhà hàng' })).toBeInTheDocument();
  });

  it('navigates with the new category param and resets page when a category is selected', () => {
    searchParamsString = 'q=phu+quoc&page=3';
    render(<SearchFilters total={0} categories={CATEGORIES} />);
    fireEvent.change(screen.getByLabelText('Danh mục'), { target: { value: 'c1' } });
    expect(push).toHaveBeenCalledWith('/vi/search?q=phu+quoc&category=c1');
  });

  it('removes the ward param and resets page when "Tất cả" is selected', () => {
    searchParamsString = 'ward=Duong+Dong&page=2';
    render(<SearchFilters total={0} categories={CATEGORIES} />);
    fireEvent.change(screen.getByLabelText('Khu vực'), { target: { value: '' } });
    expect(push).toHaveBeenCalledWith('/vi/search');
  });

  it('sets the price_range param without disturbing other existing params', () => {
    searchParamsString = 'category=c2';
    render(<SearchFilters total={0} categories={CATEGORIES} />);
    fireEvent.change(screen.getByLabelText('Mức giá'), { target: { value: 'mid' } });
    expect(push).toHaveBeenCalledWith('/vi/search?category=c2&price_range=mid');
  });

  // Phase 14 (EN UI completion): "Danh mục"/"Khu vực"/"Mức giá"/"Tất cả" đều là chrome tiếng Việt
  // cứng trước bản này. Danh mục dùng field `name_en` THẬT của API (taxonomy nhỏ/cố định, khác
  // place/hotel/restaurant/tour content — chưa có bản dịch được duyệt).
  it('locale="en" → toàn bộ nhãn dùng bản dịch tiếng Anh, danh mục dùng name_en thật', () => {
    render(
      <LocaleProvider locale="en">
        <SearchFilters total={42} categories={CATEGORIES} />
      </LocaleProvider>,
    );
    expect(screen.getByText('42 results')).toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toHaveValue('');
    expect(screen.getByLabelText('Area')).toHaveValue('');
    expect(screen.getByLabelText('Price')).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Hotel' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Restaurant' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Khách sạn' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Price'), { target: { value: 'mid' } });
    expect(push).toHaveBeenCalledWith('/en/search?price_range=mid');
  });

  it('locale="en" + category thiếu name_en → dùng lại name_vi (fallback, không phải chuỗi rỗng)', () => {
    const noEnglish: Category[] = [
      { id: 'c3', slug: 'beach', name_vi: 'Bãi biển', name_en: null, icon: null, parent_id: null },
    ];
    render(
      <LocaleProvider locale="en">
        <SearchFilters total={0} categories={noEnglish} />
      </LocaleProvider>,
    );
    expect(screen.getByRole('option', { name: 'Bãi biển' })).toBeInTheDocument();
  });
});
