/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import { RestaurantFilters } from './RestaurantFilters';

const push = jest.fn();
let searchParamsString = '';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(searchParamsString),
}));

describe('RestaurantFilters', () => {
  beforeEach(() => {
    push.mockClear();
    searchParamsString = '';
  });

  it('renders the result count', () => {
    render(<RestaurantFilters total={9} />);
    expect(screen.getByText('9 nhà hàng')).toBeInTheDocument();
  });

  it('defaults sort/price_range/cuisine to their "all" values when no params are present', () => {
    render(<RestaurantFilters total={0} />);
    expect(screen.getByLabelText('Sắp xếp')).toHaveValue('rating_desc');
    expect(screen.getByLabelText('Mức giá')).toHaveValue('');
    expect(screen.getByLabelText('Ẩm thực')).toHaveValue('');
  });

  it('navigates with the new price_range param and resets page when it changes', () => {
    searchParamsString = 'page=2';
    render(<RestaurantFilters total={0} />);
    fireEvent.change(screen.getByLabelText('Mức giá'), { target: { value: 'low' } });
    expect(push).toHaveBeenCalledWith('/restaurants?price_range=low');
  });

  it('sets the cuisine param without disturbing an existing price_range param', () => {
    searchParamsString = 'price_range=mid';
    render(<RestaurantFilters total={0} />);
    fireEvent.change(screen.getByLabelText('Ẩm thực'), { target: { value: 'seafood' } });
    expect(push).toHaveBeenCalledWith('/restaurants?price_range=mid&cuisine=seafood');
  });

  it('removes the cuisine param and resets page when "Tất cả" is selected', () => {
    searchParamsString = 'cuisine=bbq&page=4';
    render(<RestaurantFilters total={0} />);
    fireEvent.change(screen.getByLabelText('Ẩm thực'), { target: { value: '' } });
    expect(push).toHaveBeenCalledWith('/restaurants');
  });
});
