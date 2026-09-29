/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import { GuideFilters } from './GuideFilters';
import { LocaleProvider } from '@/lib/LocaleContext';

const push = jest.fn();
let searchParamsString = '';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(searchParamsString),
}));

describe('GuideFilters', () => {
  beforeEach(() => {
    push.mockClear();
    searchParamsString = '';
  });

  it('renders the result count', () => {
    render(<GuideFilters total={5} />);
    expect(screen.getByText('5 bài viết')).toBeInTheDocument();
  });

  it('defaults the category select to empty (all) when no category param is present', () => {
    render(<GuideFilters total={0} />);
    expect(screen.getByLabelText('Chuyên mục')).toHaveValue('');
  });

  it('navigates with the new category param when changed', () => {
    render(<GuideFilters total={0} />);
    fireEvent.change(screen.getByLabelText('Chuyên mục'), { target: { value: 'am_thuc' } });
    expect(push).toHaveBeenCalledWith('/vi/guide?category=am_thuc');
  });

  it('removes the category param when "Tất cả" is selected', () => {
    searchParamsString = 'category=am_thuc';
    render(<GuideFilters total={0} />);
    fireEvent.change(screen.getByLabelText('Chuyên mục'), { target: { value: '' } });
    expect(push).toHaveBeenCalledWith('/vi/guide');
  });

  it('preserves other existing params (e.g. tag) when changing category', () => {
    searchParamsString = 'tag=bien';
    render(<GuideFilters total={0} />);
    fireEvent.change(screen.getByLabelText('Chuyên mục'), { target: { value: 'luu_tru' } });
    expect(push).toHaveBeenCalledWith('/vi/guide?tag=bien&category=luu_tru');
  });

  it('locale="en" — labels use the English translation, navigation still targets /en/guide', () => {
    render(
      <LocaleProvider locale="en">
        <GuideFilters total={5} />
      </LocaleProvider>,
    );
    expect(screen.getByText('5 articles')).toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'am_thuc' } });
    expect(push).toHaveBeenCalledWith('/en/guide?category=am_thuc');
  });
});
