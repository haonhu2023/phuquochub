/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import SearchLoading from './loading';

// Đại diện cho khuôn loading.tsx dùng chung — kiểm thử kỹ MỘT file (search/loading.tsx, phản ánh
// bố cục thật rõ nhất trong 4 route vì /search có Server Component await dữ liệu thật). 3 file còn
// lại (explore/map/dashboard loading.tsx) là component thuần, không nhánh logic, không state,
// không props — xác nhận đúng qua typecheck/build/xác minh trực tiếp (Phase 4), viết test riêng
// cho từng file sẽ chỉ lặp lại "render() không ném lỗi" không thêm giá trị.
describe('SearchLoading (đại diện khuôn loading.tsx dùng chung cho explore/map/search/dashboard)', () => {
  it('render không ném lỗi', () => {
    expect(() => render(<SearchLoading />)).not.toThrow();
  });

  it('đánh dấu aria-busy + aria-label để assistive tech biết đang tải', () => {
    render(<SearchLoading />);
    const region = screen.getByLabelText('Đang tải kết quả tìm kiếm');
    expect(region).toHaveAttribute('aria-busy', 'true');
  });

  it('không render bất kỳ nội dung kết quả thật nào (chỉ khối skeleton giữ chỗ, không link/text thật)', () => {
    render(<SearchLoading />);
    // Các <li> là khối skeleton giữ chỗ (đúng số lượng cố định), KHÔNG phải kết quả thật —
    // khẳng định không có link (SearchLoading không render <a>/<Link> nào, khác kết quả thật).
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
  });
});
