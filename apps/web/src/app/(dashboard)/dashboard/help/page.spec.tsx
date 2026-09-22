/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import DashboardHelpPage from './page';

// N2 (2026-09-22) — trang Hướng dẫn TĨNH, không CMS. Test chỉ khẳng định các mục theo đúng phạm vi
// đã giao (địa điểm/ảnh/bài viết/nội dung website/xử lý xung đột) đều có mặt, và trang KHÔNG hứa
// một tính năng chưa tồn tại (sao lưu/BK1 chưa xây — không được nhắc ở đây).
describe('DashboardHelpPage', () => {
  it('có đủ 5 mục theo đúng phạm vi N2', () => {
    render(<DashboardHelpPage />);
    expect(screen.getByRole('heading', { name: /Tạo và sửa địa điểm/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Thêm và quản lý ảnh/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Viết và xuất bản bài viết/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Sửa nội dung trang chủ/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Khi có thông báo xung đột/i })).toBeInTheDocument();
  });

  it('không nhắc tới sao lưu/trạng thái backup — tính năng đó chưa được xây (BK1)', () => {
    render(<DashboardHelpPage />);
    expect(screen.queryByText(/sao lưu/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/backup/i)).not.toBeInTheDocument();
  });

  it('nói rõ nội dung trang chủ áp dụng ngay, không có bản nháp', () => {
    render(<DashboardHelpPage />);
    expect(screen.getByText(/không có bản nháp/i)).toBeInTheDocument();
  });
});
