/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { Header } from './Header';
import { getNavCopy } from './nav.copy';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/vi/restaurants',
  useSearchParams: () => new URLSearchParams('price_range=high'),
}));

describe('Header — điều hướng chính (Phase 4)', () => {
  it('mọi mục header trỏ tới route CÓ THẬT, khớp locale', () => {
    render(<Header locale="vi" />);
    const copy = getNavCopy('vi');
    for (const item of copy.headerItems) {
      // Mỗi mục xuất hiện 2 lần (desktop + panel di động) — cả hai phải cùng trỏ đúng href.
      const links = screen.getAllByRole('link', { name: item.label });
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        expect(link).toHaveAttribute('href', `/vi${item.href}`);
      }
    }
  });

  it('locale="en": không còn nhãn tiếng Việt nào trong header', () => {
    render(<Header locale="en" />);
    const viCopy = getNavCopy('vi');
    for (const item of viCopy.headerItems) {
      expect(screen.queryByText(item.label)).not.toBeInTheDocument();
    }
  });

  it('logo trỏ về trang chủ đúng locale', () => {
    render(<Header locale="en" />);
    expect(screen.getByRole('link', { name: 'PhuQuocHub' })).toHaveAttribute('href', '/en');
  });

  it('có liên kết tìm kiếm trỏ tới /{locale}/search', () => {
    render(<Header locale="vi" />);
    expect(screen.getByRole('link', { name: 'Tìm kiếm' })).toHaveAttribute('href', '/vi/search');
  });

  it('menu di động dùng <details>/<summary> gốc — hoạt động không cần JavaScript', () => {
    const { container } = render(<Header locale="vi" />);
    expect(container.querySelector('details')).not.toBeNull();
    expect(container.querySelector('details > summary')).not.toBeNull();
  });

  it('nút mở menu di động có nhãn trợ năng', () => {
    render(<Header locale="vi" />);
    expect(screen.getByLabelText('Mở menu')).toBeInTheDocument();
  });

  it('công tắc ngôn ngữ giữ nguyên path + query hiện tại', () => {
    render(<Header locale="vi" />);
    const enLinks = screen.getAllByRole('link', { name: 'EN' });
    for (const link of enLinks) {
      expect(link).toHaveAttribute('href', '/en/restaurants?price_range=high');
    }
  });
});
