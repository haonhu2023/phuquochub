/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { MapCta, OwnerCta } from './HomeCtas';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('MapCta', () => {
  it('liên kết tới trải nghiệm bản đồ đã có (/map)', () => {
    render(<MapCta />);
    expect(screen.getByRole('link', { name: 'Mở bản đồ' })).toHaveAttribute('href', '/map');
  });

  it('là section có tiêu đề h2 gắn nhãn', () => {
    render(<MapCta />);
    expect(screen.getByRole('heading', { level: 2, name: 'Xem trên bản đồ' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Xem trên bản đồ' })).toBeInTheDocument();
  });
});

describe('OwnerCta', () => {
  it('liên kết tới luồng xác nhận quyền quản lý CÓ THẬT', () => {
    render(<OwnerCta />);
    expect(screen.getByRole('link', { name: 'Xác nhận quyền quản lý' })).toHaveAttribute(
      'href',
      '/dashboard/business-claims/new',
    );
  });

  it('là section có tiêu đề h2 gắn nhãn', () => {
    render(<OwnerCta />);
    expect(screen.getByRole('heading', { level: 2, name: 'Bạn là chủ cơ sở?' })).toBeInTheDocument();
  });

  // Mục PHỤ trên trang dành cho khách tham quan: đúng một lời kêu gọi, không phải một khối bán hàng.
  it('chỉ có duy nhất một liên kết (không phải khối quảng bá nhiều lối)', () => {
    render(<OwnerCta />);
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('không hứa hẹn số liệu/quyền lợi bịa — chỉ nêu việc thật sự làm được sau khi xác nhận', () => {
    render(<OwnerCta />);
    expect(
      screen.getByText(
        'Xác nhận quyền quản lý để cập nhật thông tin, giờ mở cửa và liên hệ của cơ sở.',
      ),
    ).toBeInTheDocument();
  });
});
