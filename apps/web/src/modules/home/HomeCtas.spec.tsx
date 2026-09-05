/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { MapCta, OwnerCta } from './HomeCtas';
import { getHomeCopy } from './home.copy';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('MapCta', () => {
  it('liên kết tới trải nghiệm bản đồ đã có (/{locale}/map)', () => {
    render(<MapCta locale="vi" />);
    const copy = getHomeCopy('vi');
    expect(screen.getByRole('link', { name: copy.mapLink })).toHaveAttribute('href', '/vi/map');
  });

  it('PR A: dùng đúng locale="en" khi được truyền — cả URL lẫn nội dung', () => {
    render(<MapCta locale="en" />);
    const copy = getHomeCopy('en');
    expect(screen.getByRole('link', { name: copy.mapLink })).toHaveAttribute('href', '/en/map');
    expect(screen.getByRole('heading', { level: 2, name: copy.mapTitle })).toBeInTheDocument();
  });

  it('là section có tiêu đề h2 gắn nhãn', () => {
    render(<MapCta locale="vi" />);
    const title = getHomeCopy('vi').mapTitle;
    expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: title })).toBeInTheDocument();
  });

  it('minh hoạ bản đồ CSS là trang trí (aria-hidden), không phải nội dung/liên kết thật', () => {
    const { container } = render(<MapCta locale="vi" />);
    // Đúng một liên kết trong section: "Mở bản đồ". Minh hoạ CSS không được mọc thêm liên kết nào.
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });
});

describe('OwnerCta', () => {
  it('liên kết tới luồng xác nhận quyền quản lý CÓ THẬT (không qua localizedHref — ngoài [locale])', () => {
    render(<OwnerCta locale="vi" />);
    const copy = getHomeCopy('vi');
    expect(screen.getByRole('link', { name: copy.ownerLink })).toHaveAttribute(
      'href',
      '/dashboard/business-claims/new',
    );
  });

  it('href không đổi theo locale — (dashboard) nằm ngoài segment [locale]', () => {
    render(<OwnerCta locale="en" />);
    const copy = getHomeCopy('en');
    expect(screen.getByRole('link', { name: copy.ownerLink })).toHaveAttribute(
      'href',
      '/dashboard/business-claims/new',
    );
  });

  it('là section có tiêu đề h2 gắn nhãn', () => {
    render(<OwnerCta locale="vi" />);
    expect(
      screen.getByRole('heading', { level: 2, name: getHomeCopy('vi').ownerTitle }),
    ).toBeInTheDocument();
  });

  // Mục PHỤ trên trang dành cho khách tham quan: đúng một lời kêu gọi, không phải một khối bán hàng.
  it('chỉ có duy nhất một liên kết (không phải khối quảng bá nhiều lối)', () => {
    render(<OwnerCta locale="vi" />);
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('không hứa hẹn số liệu/quyền lợi bịa — chỉ nêu việc thật sự làm được sau khi xác nhận', () => {
    render(<OwnerCta locale="vi" />);
    expect(screen.getByText(getHomeCopy('vi').ownerDesc)).toBeInTheDocument();
  });
});
