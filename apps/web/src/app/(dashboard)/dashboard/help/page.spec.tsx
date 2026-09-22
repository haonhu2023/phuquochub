/** @jest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import DashboardHelpPage from './page';

// N2 (2026-09-22) — trang Hướng dẫn TĨNH, không CMS. Test chỉ khẳng định 5 mục tĩnh theo đúng
// phạm vi đã giao (địa điểm/ảnh/bài viết/nội dung website/xử lý xung đột) đều có mặt.
//
// Mục 6 (BK1, cùng ngày, <BackupStatusSection />) là CLIENT component riêng, đọc quyền/API thật —
// xem BackupStatusSection.spec.tsx cho hành vi đầy đủ của nó (ẩn khi chưa đăng nhập/không có
// quyền, hiện tình trạng thật khi có). Test dưới đây chỉ xác nhận trang KHÔNG hiện nhầm nội dung
// sao lưu cho một phiên CHƯA ĐĂNG NHẬP (trạng thái mặc định của test này, không mock session) —
// không phải "tính năng chưa được xây".
describe('DashboardHelpPage', () => {
  it('có đủ 5 mục tĩnh theo đúng phạm vi N2', () => {
    render(<DashboardHelpPage />);
    expect(screen.getByRole('heading', { name: /Tạo và sửa địa điểm/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Thêm và quản lý ảnh/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Viết và xuất bản bài viết/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Sửa nội dung trang chủ/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Khi có thông báo xung đột/i })).toBeInTheDocument();
  });

  it('chưa đăng nhập → khối tình trạng sao lưu ẩn hoàn toàn (không hiện nhầm cho khách)', async () => {
    render(<DashboardHelpPage />);
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /Tình trạng sao lưu/i })).not.toBeInTheDocument(),
    );
  });

  it('nói rõ nội dung trang chủ áp dụng ngay, không có bản nháp', () => {
    render(<DashboardHelpPage />);
    expect(screen.getByText(/không có bản nháp/i)).toBeInTheDocument();
  });
});
