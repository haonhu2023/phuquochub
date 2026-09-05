/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { CategoryLinks } from './CategoryLinks';
import { getHomeCopy } from './home.copy';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Mỗi lối vào PHẢI trỏ tới một trang duyệt CÓ THẬT trong app/(public) — danh sách này là hợp đồng
// giữa trang chủ và các route thật; nếu ai đó xoá/đổi tên một trang duyệt, test này phải đỏ chứ
// không để trang chủ âm thầm mọc liên kết chết. Nguồn nhãn/route giờ là `home.copy.ts`.
const EXPECTED = getHomeCopy('vi').categories.map((c) => [c.name, `/vi${c.href}`] as const);

describe('CategoryLinks', () => {
  it.each(EXPECTED)('“%s” liên kết tới %s', (name, href) => {
    render(<CategoryLinks locale="vi" />);
    expect(screen.getByRole('link', { name: new RegExp(name) })).toHaveAttribute('href', href);
  });

  it('có liên kết tới toàn bộ danh sách địa điểm', () => {
    render(<CategoryLinks locale="vi" />);
    expect(screen.getByRole('link', { name: /Tất cả địa điểm/ })).toHaveAttribute('href', '/vi/places');
  });

  it('PR A: dùng đúng locale="en" khi được truyền — cả URL lẫn nhãn', () => {
    render(<CategoryLinks locale="en" />);
    const enCopy = getHomeCopy('en');
    expect(screen.getByRole('link', { name: new RegExp(enCopy.categories[0].name) })).toHaveAttribute(
      'href',
      `/en${enCopy.categories[0].href}`,
    );
  });

  it('là section có tiêu đề h2 gắn nhãn (không phải div trơn)', () => {
    render(<CategoryLinks locale="vi" />);
    const title = getHomeCopy('vi').categoriesTitle;
    const heading = screen.getByRole('heading', { level: 2, name: title });
    expect(heading).toBeInTheDocument();
    expect(screen.getByRole('region', { name: title })).toBeInTheDocument();
  });

  it('không render lối vào nào ngoài danh sách đã khai báo', () => {
    render(<CategoryLinks locale="vi" />);
    const tiles = screen
      .getByRole('region', { name: getHomeCopy('vi').categoriesTitle })
      .querySelectorAll('a');
    // 6 lối vào danh mục + 1 liên kết "Tất cả địa điểm".
    expect(tiles).toHaveLength(EXPECTED.length + 1);
  });
});
