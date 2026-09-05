/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import { BeachFilters } from './BeachFilters';
import { LocaleProvider } from '@/lib/LocaleContext';

const push = jest.fn();
let searchParamsString = '';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(searchParamsString),
}));

describe('BeachFilters', () => {
  beforeEach(() => {
    push.mockClear();
    searchParamsString = '';
  });

  it('renders the result count', () => {
    render(<BeachFilters total={3} />);
    expect(screen.getByText('3 bãi biển')).toBeInTheDocument();
  });

  it('defaults sort/ward/price_range to their "all" values when no params are present', () => {
    render(<BeachFilters total={0} />);
    expect(screen.getByLabelText('Sắp xếp')).toHaveValue('rating_desc');
    expect(screen.getByLabelText('Khu vực')).toHaveValue('');
    expect(screen.getByLabelText('Mức giá')).toHaveValue('');
  });

  it('exposes a beach-specific "newest" sort option not present on Hotel/Restaurant filters', () => {
    render(<BeachFilters total={0} />);
    expect(screen.getByRole('option', { name: 'Mới thêm gần đây' })).toBeInTheDocument();
  });

  it('navigates with the new ward param and resets page when it changes', () => {
    searchParamsString = 'page=2';
    render(<BeachFilters total={0} />);
    fireEvent.change(screen.getByLabelText('Khu vực'), { target: { value: 'Hàm Ninh' } });
    expect(push).toHaveBeenCalledWith('/vi/beaches?ward=H%C3%A0m+Ninh');
  });

  it('sets the price_range param without disturbing an existing ward param', () => {
    searchParamsString = 'ward=Hàm+Ninh';
    render(<BeachFilters total={0} />);
    fireEvent.change(screen.getByLabelText('Mức giá'), { target: { value: 'free' } });
    expect(push).toHaveBeenCalledWith('/vi/beaches?ward=H%C3%A0m+Ninh&price_range=free');
  });

  it('removes the price_range param and resets page when "Tất cả" is selected', () => {
    searchParamsString = 'price_range=free&page=5';
    render(<BeachFilters total={0} />);
    fireEvent.change(screen.getByLabelText('Mức giá'), { target: { value: '' } });
    expect(push).toHaveBeenCalledWith('/vi/beaches');
  });

  // Phase 14 (EN UI completion): "Sắp xếp"/"Khu vực"/"Mức giá"/"Tất cả" đều là chrome tiếng Việt
  // cứng trước bản này — khoá đúng bản dịch tiếng Anh.
  it('locale="en" → toàn bộ nhãn/kết quả dùng bản dịch tiếng Anh, điều hướng vẫn tới /en/beaches', () => {
    render(
      <LocaleProvider locale="en">
        <BeachFilters total={3} />
      </LocaleProvider>,
    );
    expect(screen.getByText('3 beaches')).toBeInTheDocument();
    expect(screen.getByLabelText('Sort by')).toHaveValue('rating_desc');
    expect(screen.getByLabelText('Area')).toHaveValue('');
    expect(screen.getByLabelText('Price')).toHaveValue('');

    fireEvent.change(screen.getByLabelText('Price'), { target: { value: 'free' } });
    expect(push).toHaveBeenCalledWith('/en/beaches?price_range=free');
  });
});
