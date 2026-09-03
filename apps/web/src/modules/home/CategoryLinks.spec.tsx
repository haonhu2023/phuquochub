/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { CategoryLinks } from './CategoryLinks';

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
// không để trang chủ âm thầm mọc liên kết chết.
const EXPECTED = [
  ['Khách sạn', '/vi/hotels'],
  ['Nhà hàng', '/vi/restaurants'],
  ['Tour', '/vi/tours'],
  ['Điểm tham quan', '/vi/attractions'],
  ['Bãi biển', '/vi/beaches'],
  ['Sự kiện', '/vi/events'],
] as const;

describe('CategoryLinks', () => {
  it.each(EXPECTED)('“%s” liên kết tới %s', (name, href) => {
    render(<CategoryLinks locale="vi" />);
    expect(screen.getByRole('link', { name: new RegExp(name) })).toHaveAttribute('href', href);
  });

  it('có liên kết tới toàn bộ danh sách địa điểm', () => {
    render(<CategoryLinks locale="vi" />);
    expect(screen.getByRole('link', { name: /Tất cả địa điểm/ })).toHaveAttribute('href', '/vi/places');
  });

  it('PR A: dùng đúng locale="en" khi được truyền', () => {
    render(<CategoryLinks locale="en" />);
    expect(screen.getByRole('link', { name: /Khách sạn/ })).toHaveAttribute('href', '/en/hotels');
  });

  it('là section có tiêu đề h2 gắn nhãn (không phải div trơn)', () => {
    render(<CategoryLinks locale="vi" />);
    const heading = screen.getByRole('heading', { level: 2, name: 'Bạn đang tìm gì?' });
    expect(heading).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Bạn đang tìm gì?' })).toBeInTheDocument();
  });

  it('không render lối vào nào ngoài danh sách đã khai báo', () => {
    render(<CategoryLinks locale="vi" />);
    const tiles = screen.getByRole('region', { name: 'Bạn đang tìm gì?' }).querySelectorAll('a');
    // 6 lối vào danh mục + 1 liên kết "Tất cả địa điểm".
    expect(tiles).toHaveLength(EXPECTED.length + 1);
  });
});
