/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import SearchError from './error';

// Đại diện cho khuôn error.tsx dùng chung ở CẢ 4 route của milestone này (explore/map/search/
// dashboard) — cùng cấu trúc hệt hotels/restaurants/tours/events đã có (chỉ khác chuỗi tiêu đề).
// Kiểm thử kỹ MỘT file thay vì lặp lại cho cả 4 (yêu cầu tránh trùng lặp ít giá trị) — 3 file còn
// lại (explore/map/dashboard) được xác nhận đúng qua: typecheck (cùng chữ ký {error, reset} do
// Next.js ép kiểu ở route segment), build (`next build` thất bại nếu error.tsx không phải client
// component hợp lệ), và xác minh trực tiếp trên trình duyệt (Phase 4).
describe('SearchError (đại diện khuôn error.tsx dùng chung cho explore/map/search/dashboard)', () => {
  const baseError = Object.assign(new Error('ECONNREFUSED 127.0.0.1:4000 ETIMEDOUT stack trace secret'), {
    digest: 'abc123',
  });

  it('hiển thị thông báo tiếng Việt thân thiện, KHÔNG lộ message/stack kỹ thuật gốc', () => {
    render(<SearchError error={baseError} reset={() => {}} />);

    expect(screen.getByText('Không tải được kết quả tìm kiếm')).toBeInTheDocument();
    expect(screen.getByText(/Có thể do sự cố kết nối/)).toBeInTheDocument();
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ETIMEDOUT/)).not.toBeInTheDocument();
    expect(screen.queryByText('abc123')).not.toBeInTheDocument();
  });

  it('vùng thông báo có role="alert" (được assistive tech công bố tự động khi xuất hiện)', () => {
    render(<SearchError error={baseError} reset={() => {}} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('nút "Thử lại" là <button> thật (semantics đúng), bấm vào gọi reset()', () => {
    const reset = jest.fn();
    render(<SearchError error={baseError} reset={reset} />);

    const button = screen.getByRole('button', { name: 'Thử lại' });
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');

    fireEvent.click(button);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('không ném lỗi khi render dù error.digest vắng mặt', () => {
    const noDigest = new Error('lỗi không có digest');
    expect(() => render(<SearchError error={noDigest} reset={() => {}} />)).not.toThrow();
  });
});
