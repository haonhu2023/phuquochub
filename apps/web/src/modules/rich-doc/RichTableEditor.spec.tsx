/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import type { RichTableBlock } from '@phuquochub/shared-types';
import { RichTableEditor } from './RichTableEditor';

function table2x2(): RichTableBlock {
  return {
    type: 'table',
    headerRow: true,
    rows: [
      [[{ text: 'Cột A' }], [{ text: 'Cột B' }]],
      [[{ text: 'a1' }], [{ text: 'b1' }]],
    ],
  };
}

describe('RichTableEditor', () => {
  it('sửa một ô → onChange nhận đúng bảng đã cập nhật, các ô khác không đổi', () => {
    const onChange = jest.fn();
    render(<RichTableEditor table={table2x2()} onChange={onChange} onRemove={jest.fn()} />);
    fireEvent.change(screen.getByLabelText('Hàng 2, cột 1'), { target: { value: 'a1 sửa' } });
    expect(onChange).toHaveBeenCalledWith({
      ...table2x2(),
      rows: [
        [[{ text: 'Cột A' }], [{ text: 'Cột B' }]],
        [[{ text: 'a1 sửa' }], [{ text: 'b1' }]],
      ],
    });
  });

  it('+ Hàng → thêm một hàng mới đủ số cột, toàn ô rỗng', () => {
    const onChange = jest.fn();
    render(<RichTableEditor table={table2x2()} onChange={onChange} onRemove={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Hàng' }));
    const arg = onChange.mock.calls[0][0] as RichTableBlock;
    expect(arg.rows).toHaveLength(3);
    expect(arg.rows[2]).toEqual([[{ text: '' }], [{ text: '' }]]);
  });

  it('+ Cột → thêm một cột mới cho MỌI hàng, toàn ô rỗng', () => {
    const onChange = jest.fn();
    render(<RichTableEditor table={table2x2()} onChange={onChange} onRemove={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Cột' }));
    const arg = onChange.mock.calls[0][0] as RichTableBlock;
    expect(arg.rows[0]).toHaveLength(3);
    expect(arg.rows[1]).toHaveLength(3);
    expect(arg.rows[0][2]).toEqual([{ text: '' }]);
  });

  it('xoá hàng → đúng hàng bị loại, các hàng khác giữ nguyên thứ tự', () => {
    const onChange = jest.fn();
    render(<RichTableEditor table={table2x2()} onChange={onChange} onRemove={jest.fn()} />);
    fireEvent.click(screen.getAllByTitle('Xoá hàng này')[0]); // hàng đầu tiên
    const arg = onChange.mock.calls[0][0] as RichTableBlock;
    expect(arg.rows).toEqual([[[{ text: 'a1' }], [{ text: 'b1' }]]]);
  });

  it('không cho xoá hàng cuối cùng (còn 1 hàng) — nút bị disabled', () => {
    const onChange = jest.fn();
    const oneRow: RichTableBlock = { type: 'table', headerRow: false, rows: [[[{ text: 'x' }]]] };
    render(<RichTableEditor table={oneRow} onChange={onChange} onRemove={jest.fn()} />);
    expect(screen.getByTitle('Xoá hàng này')).toBeDisabled();
  });

  it('không cho xoá cột cuối cùng (còn 1 cột) — nút bị disabled', () => {
    const onChange = jest.fn();
    const oneCol: RichTableBlock = { type: 'table', headerRow: false, rows: [[[{ text: 'x' }]], [[{ text: 'y' }]]] };
    render(<RichTableEditor table={oneCol} onChange={onChange} onRemove={jest.fn()} />);
    expect(screen.getByTitle('Xoá cột này')).toBeDisabled();
  });

  it('bật/tắt "Hàng đầu tiên là tiêu đề" → onChange đúng headerRow', () => {
    const onChange = jest.fn();
    const noHeader = { ...table2x2(), headerRow: false };
    render(<RichTableEditor table={noHeader} onChange={onChange} onRemove={jest.fn()} />);
    fireEvent.click(screen.getByLabelText('Hàng đầu tiên là tiêu đề'));
    expect(onChange).toHaveBeenCalledWith({ ...noHeader, headerRow: true });
  });

  it('sửa chú thích bảng → onChange với caption mới; để trống → caption undefined (không lưu chuỗi rỗng)', () => {
    const onChange = jest.fn();
    const { rerender } = render(<RichTableEditor table={table2x2()} onChange={onChange} onRemove={jest.fn()} />);
    const captionInput = screen.getByPlaceholderText('Không bắt buộc');
    fireEvent.change(captionInput, { target: { value: 'Bảng giá' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...table2x2(), caption: 'Bảng giá' });
    // Giả lập parent (controlled component) cập nhật lại prop sau onChange — như cách
    // RichDescriptionEditor thực sự dùng component này — trước khi gửi sự kiện tiếp theo.
    rerender(<RichTableEditor table={{ ...table2x2(), caption: 'Bảng giá' }} onChange={onChange} onRemove={jest.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Không bắt buộc'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...table2x2(), caption: undefined });
  });

  it('bấm "Xoá bảng" → gọi onRemove', () => {
    const onRemove = jest.fn();
    render(<RichTableEditor table={table2x2()} onChange={jest.fn()} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: 'Xoá bảng' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('disabled=true → mọi input/nút đều bị vô hiệu hoá', () => {
    render(<RichTableEditor table={table2x2()} onChange={jest.fn()} onRemove={jest.fn()} disabled />);
    expect(screen.getByLabelText('Hàng 1, cột 1')).toBeDisabled();
    expect(screen.getByRole('button', { name: '+ Hàng' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Xoá bảng' })).toBeDisabled();
  });
});
