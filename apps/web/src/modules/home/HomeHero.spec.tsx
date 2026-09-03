/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { HomeHero } from './HomeHero';

describe('HomeHero', () => {
  it('có đúng MỘT h1 là tiêu đề trang', () => {
    render(<HomeHero />);
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Khám phá Phú Quốc');
  });

  it('nêu rõ phạm vi nội dung trong lede', () => {
    render(<HomeHero />);
    expect(
      screen.getByText('Tìm địa điểm, khách sạn, nhà hàng, tour và trải nghiệm tại Phú Quốc.'),
    ).toBeInTheDocument();
  });

  // Tái dùng SearchBox: form GET thật tới /{locale}/search — hoạt động cả khi JS chưa chạy, và
  // KHÔNG có triển khai tìm kiếm thứ hai nào trên trang chủ.
  it('ô tìm kiếm là form GET điều hướng tới /vi/search (mặc định) với tham số q', () => {
    const { container } = render(<HomeHero />);
    const form = container.querySelector('form');
    expect(form).toHaveAttribute('action', '/vi/search');
    expect(form).toHaveAttribute('method', 'get');
    expect(form?.querySelector('input[name="q"]')).toBeInTheDocument();
  });

  it('PR A: dùng đúng locale="en" khi được truyền', () => {
    const { container } = render(<HomeHero locale="en" />);
    expect(container.querySelector('form')).toHaveAttribute('action', '/en/search');
  });

  it('ô nhập có nhãn cho trình đọc màn hình và bắt đầu rỗng', () => {
    render(<HomeHero />);
    const input = screen.getByLabelText('Từ khoá tìm kiếm');
    expect(input).toHaveValue('');
  });

  // Trang chủ KHÔNG được áp sẵn bộ lọc nào lên /search — người dùng bắt đầu từ trạng thái sạch.
  it('không gửi kèm bộ lọc ẩn nào (category/ward/price_range)', () => {
    const { container } = render(<HomeHero />);
    expect(container.querySelectorAll('input[type="hidden"]')).toHaveLength(0);
  });

  it('có nút gửi bấm được', () => {
    render(<HomeHero />);
    expect(screen.getByRole('button', { name: 'Tìm' })).toBeInTheDocument();
  });
});
