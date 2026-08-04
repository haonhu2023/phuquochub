/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import { ModerationFilters } from './ModerationFilters';

const push = jest.fn();
let searchParamsString = '';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(searchParamsString),
}));

describe('ModerationFilters', () => {
  beforeEach(() => {
    push.mockClear();
    searchParamsString = '';
  });

  it('khởi tạo giá trị select từ URL + hiện số lượng', () => {
    searchParamsString = 'status=open&severity=high';
    render(<ModerationFilters total={3} />);
    expect(screen.getByLabelText('Trạng thái')).toHaveValue('open');
    expect(screen.getByLabelText('Mức độ')).toHaveValue('high');
    expect(screen.getByText('3 case')).toBeInTheDocument();
  });

  it('đổi bộ lọc → push URL và reset page (xoá page)', () => {
    searchParamsString = 'page=4';
    render(<ModerationFilters total={0} />);
    fireEvent.change(screen.getByLabelText('Mức độ'), { target: { value: 'critical' } });
    expect(push).toHaveBeenCalledWith('/dashboard/moderation?severity=critical');
  });

  it('giữ nguyên bộ lọc khác khi set thêm một bộ lọc', () => {
    searchParamsString = 'status=open';
    render(<ModerationFilters total={0} />);
    fireEvent.change(screen.getByLabelText('Nguồn'), { target: { value: 'report' } });
    expect(push).toHaveBeenCalledWith('/dashboard/moderation?status=open&source=report');
  });

  it('chọn giá trị rỗng → xoá filter đó (clear)', () => {
    searchParamsString = 'status=resolved&source=report';
    render(<ModerationFilters total={0} />);
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: '' } });
    expect(push).toHaveBeenCalledWith('/dashboard/moderation?source=report');
  });

  it('assigned_to cập nhật khi nhấn Enter', () => {
    render(<ModerationFilters total={0} />);
    const input = screen.getByLabelText('Người xử lý (UUID)');
    fireEvent.change(input, { target: { value: 'uuid-9' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/dashboard/moderation?assigned_to=uuid-9');
  });
});
