/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { TrustSection } from './TrustSection';
import { getHomeCopy } from './home.copy';

describe('TrustSection', () => {
  it('là section có tiêu đề h2 gắn nhãn', () => {
    render(<TrustSection locale="vi" />);
    const title = getHomeCopy('vi').trustTitle;
    expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: title })).toBeInTheDocument();
  });

  it('chỉ nêu hành vi sản phẩm THẬT SỰ làm — không có nút/liên kết nào (không phải một CTA trá hình)', () => {
    render(<TrustSection locale="vi" />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('render đủ mọi điểm tin cậy đã khai báo trong copy, khớp locale', () => {
    render(<TrustSection locale="en" />);
    const copy = getHomeCopy('en');
    for (const point of copy.trustPoints) {
      expect(screen.getByText(point.title)).toBeInTheDocument();
      expect(screen.getByText(point.body)).toBeInTheDocument();
    }
  });

  it('không tuyên bố "100% xác minh" hay tương tự — dữ liệu hiện tại phần lớn đang pending', () => {
    render(<TrustSection locale="vi" />);
    expect(screen.queryByText(/100%/)).not.toBeInTheDocument();
  });
});
