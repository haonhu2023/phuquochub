/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import { HotelFilters } from './HotelFilters';

const push = jest.fn();
let searchParamsString = '';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(searchParamsString),
}));

describe('HotelFilters', () => {
  beforeEach(() => {
    push.mockClear();
    searchParamsString = '';
  });

  it('renders the result count', () => {
    render(<HotelFilters total={12} />);
    expect(screen.getByText('12 khách sạn')).toBeInTheDocument();
  });

  it('defaults sort to rating_desc and stars to "Tất cả" when no params are present', () => {
    render(<HotelFilters total={0} />);
    expect(screen.getByLabelText('Sắp xếp')).toHaveValue('rating_desc');
    expect(screen.getByLabelText('Hạng sao')).toHaveValue('');
  });

  it('navigates with the new sort param and resets page when sort changes', () => {
    searchParamsString = 'page=2';
    render(<HotelFilters total={0} />);
    fireEvent.change(screen.getByLabelText('Sắp xếp'), { target: { value: 'name_asc' } });
    expect(push).toHaveBeenCalledWith('/hotels?sort=name_asc');
  });

  it('sets the stars param without disturbing an existing sort param', () => {
    searchParamsString = 'sort=name_asc';
    render(<HotelFilters total={0} />);
    fireEvent.change(screen.getByLabelText('Hạng sao'), { target: { value: '5' } });
    expect(push).toHaveBeenCalledWith('/hotels?sort=name_asc&stars=5');
  });

  it('removes the stars param and resets page when "Tất cả" is selected', () => {
    searchParamsString = 'stars=4&page=3';
    render(<HotelFilters total={0} />);
    fireEvent.change(screen.getByLabelText('Hạng sao'), { target: { value: '' } });
    expect(push).toHaveBeenCalledWith('/hotels');
  });
});
