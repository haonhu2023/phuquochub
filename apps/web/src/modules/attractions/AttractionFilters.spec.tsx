/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import { AttractionFilters } from './AttractionFilters';

const push = jest.fn();
let searchParamsString = '';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(searchParamsString),
}));

describe('AttractionFilters', () => {
  beforeEach(() => {
    push.mockClear();
    searchParamsString = '';
  });

  it('renders the result count', () => {
    render(<AttractionFilters total={7} />);
    expect(screen.getByText('7 điểm tham quan')).toBeInTheDocument();
  });

  it('defaults the sort select to rating_desc when no sort param is present', () => {
    render(<AttractionFilters total={0} />);
    expect(screen.getByLabelText('Sắp xếp')).toHaveValue('rating_desc');
  });

  it('navigates with the new sort param and resets page when sort changes', () => {
    searchParamsString = 'page=2';
    render(<AttractionFilters total={0} />);
    fireEvent.change(screen.getByLabelText('Sắp xếp'), { target: { value: 'name_asc' } });
    expect(push).toHaveBeenCalledWith('/attractions?sort=name_asc');
  });

  it('sets the ward param without disturbing existing params', () => {
    searchParamsString = 'sort=newest';
    render(<AttractionFilters total={0} />);
    fireEvent.change(screen.getByLabelText('Khu vực'), { target: { value: 'Dương Đông' } });
    expect(push).toHaveBeenCalledWith('/attractions?sort=newest&ward=D%C6%B0%C6%A1ng+%C4%90%C3%B4ng');
  });

  it('removes the price_range param when "Tất cả" is selected', () => {
    searchParamsString = 'price_range=free&page=3';
    render(<AttractionFilters total={0} />);
    fireEvent.change(screen.getByLabelText('Mức giá'), { target: { value: '' } });
    expect(push).toHaveBeenCalledWith('/attractions');
  });
});
