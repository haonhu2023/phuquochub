/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('renders nothing when there is only one page', () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} basePath="/hotels" baseQuery="" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('disables the "Trước" control on the first page', () => {
    render(<Pagination page={1} totalPages={5} basePath="/hotels" baseQuery="" />);
    const prev = screen.getByText('‹ Trước');
    expect(prev.tagName).toBe('SPAN');
    expect(prev).toHaveAttribute('aria-disabled', 'true');
  });

  it('disables the "Sau" control on the last page', () => {
    render(<Pagination page={5} totalPages={5} basePath="/hotels" baseQuery="" />);
    const next = screen.getByText('Sau ›');
    expect(next.tagName).toBe('SPAN');
    expect(next).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders "Trước"/"Sau" as links with page-shifted hrefs on a middle page', () => {
    render(<Pagination page={3} totalPages={5} basePath="/hotels" baseQuery="stars=4" />);
    const prev = screen.getByText('‹ Trước');
    const next = screen.getByText('Sau ›');
    expect(prev).toHaveAttribute('href', '/hotels?stars=4&page=2');
    expect(next).toHaveAttribute('href', '/hotels?stars=4&page=4');
  });

  it('marks the current page with aria-current and does not link it', () => {
    render(<Pagination page={3} totalPages={5} basePath="/hotels" baseQuery="" />);
    const current = screen.getByText('3');
    expect(current.tagName).toBe('SPAN');
    expect(current).toHaveAttribute('aria-current', 'page');
  });

  it('renders an ellipsis for skipped page ranges', () => {
    render(<Pagination page={1} totalPages={20} basePath="/hotels" baseQuery="" />);
    expect(screen.getByText('…')).toBeInTheDocument();
  });

  it('preserves the existing filter query string when linking to other pages', () => {
    render(
      <Pagination page={2} totalPages={3} basePath="/restaurants" baseQuery="cuisine=seafood" />,
    );
    const page1 = screen.getByText('1');
    expect(page1).toHaveAttribute('href', '/restaurants?cuisine=seafood&page=1');
  });

  it('locale="en" → renders English prev/next labels and aria-label, not Vietnamese', () => {
    render(<Pagination page={3} totalPages={5} basePath="/en/hotels" baseQuery="" locale="en" />);
    expect(screen.getByText('‹ Prev')).toBeInTheDocument();
    expect(screen.getByText('Next ›')).toBeInTheDocument();
    expect(screen.queryByText('‹ Trước')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
  });
});
