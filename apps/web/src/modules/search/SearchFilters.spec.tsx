/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchFilters } from './SearchFilters';
import type { Category } from '@/modules/categories/api/categories.api';

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
    expect(push).toHaveBeenCalledWith('/search?q=phu+quoc&category=c1');
  });

  it('removes the ward param and resets page when "Tất cả" is selected', () => {
    searchParamsString = 'ward=Duong+Dong&page=2';
    render(<SearchFilters total={0} categories={CATEGORIES} />);
    fireEvent.change(screen.getByLabelText('Khu vực'), { target: { value: '' } });
    expect(push).toHaveBeenCalledWith('/search');
  });

  it('sets the price_range param without disturbing other existing params', () => {
    searchParamsString = 'category=c2';
    render(<SearchFilters total={0} categories={CATEGORIES} />);
    fireEvent.change(screen.getByLabelText('Mức giá'), { target: { value: 'mid' } });
    expect(push).toHaveBeenCalledWith('/search?category=c2&price_range=mid');
  });
});
