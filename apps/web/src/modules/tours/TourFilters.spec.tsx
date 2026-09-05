/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import { TourFilters } from './TourFilters';
import { LocaleProvider } from '@/lib/LocaleContext';

const push = jest.fn();
let searchParamsString = '';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(searchParamsString),
}));

describe('TourFilters', () => {
  beforeEach(() => {
    push.mockClear();
    searchParamsString = '';
  });

  it('renders the result count', () => {
    render(<TourFilters total={5} />);
    expect(screen.getByText('5 tour')).toBeInTheDocument();
  });

  it('defaults every filter field to its "all" value when no params are present', () => {
    render(<TourFilters total={0} />);
    expect(screen.getByLabelText('Sắp xếp')).toHaveValue('rating_desc');
    expect(screen.getByLabelText('Loại tour')).toHaveValue('');
    expect(screen.getByLabelText('Độ khó')).toHaveValue('');
    expect(screen.getByLabelText('Thời lượng')).toHaveValue('');
    expect(screen.getByLabelText('Mức giá')).toHaveValue('');
    expect(screen.getByLabelText('Khu vực khởi hành')).toHaveValue('');
  });

  it('exposes a tour-specific duration_asc sort option not present on other verticals', () => {
    render(<TourFilters total={0} />);
    expect(screen.getByRole('option', { name: 'Thời lượng ngắn nhất' })).toBeInTheDocument();
  });

  it('navigates with the new type param and resets page when it changes', () => {
    searchParamsString = 'page=2';
    render(<TourFilters total={0} />);
    fireEvent.change(screen.getByLabelText('Loại tour'), { target: { value: 'diving' } });
    expect(push).toHaveBeenCalledWith('/vi/tours?type=diving');
  });

  it('sets the numeric max_duration_minutes param (as a string) without disturbing an existing type param', () => {
    searchParamsString = 'type=trekking';
    render(<TourFilters total={0} />);
    fireEvent.change(screen.getByLabelText('Thời lượng'), { target: { value: '240' } });
    expect(push).toHaveBeenCalledWith('/vi/tours?type=trekking&max_duration_minutes=240');
  });

  it('sets the departure_area param from the shared PHU_QUOC_WARDS list', () => {
    render(<TourFilters total={0} />);
    fireEvent.change(screen.getByLabelText('Khu vực khởi hành'), { target: { value: 'An Thới' } });
    expect(push).toHaveBeenCalledWith('/vi/tours?departure_area=An+Th%E1%BB%9Bi');
  });

  it('removes the difficulty param and resets page when "Tất cả" is selected', () => {
    searchParamsString = 'difficulty=hard&page=3';
    render(<TourFilters total={0} />);
    fireEvent.change(screen.getByLabelText('Độ khó'), { target: { value: '' } });
    expect(push).toHaveBeenCalledWith('/vi/tours');
  });

  // Phase 14 (EN UI completion): mọi nhãn field/tuỳ chọn (Sắp xếp/Loại tour/Độ khó/Thời lượng/
  // Mức giá/Khu vực khởi hành/Tất cả) đều là chrome tiếng Việt cứng trước bản này.
  it('locale="en" → toàn bộ nhãn/tuỳ chọn dùng bản dịch tiếng Anh, điều hướng vẫn tới /en/tours', () => {
    render(
      <LocaleProvider locale="en">
        <TourFilters total={5} />
      </LocaleProvider>,
    );
    expect(screen.getByText('5 tours')).toBeInTheDocument();
    expect(screen.getByLabelText('Sort by')).toHaveValue('rating_desc');
    expect(screen.getByLabelText('Tour type')).toHaveValue('');
    expect(screen.getByLabelText('Difficulty')).toHaveValue('');
    expect(screen.getByLabelText('Duration')).toHaveValue('');
    expect(screen.getByLabelText('Price')).toHaveValue('');
    expect(screen.getByLabelText('Departure area')).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Shortest duration' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Diving' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tour type'), { target: { value: 'diving' } });
    expect(push).toHaveBeenCalledWith('/en/tours?type=diving');
  });
});
