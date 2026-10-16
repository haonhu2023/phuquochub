/** @jest-environment jsdom */
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimeOfDayField } from './TimeOfDayField';

// Wrapper điều khiển (controlled) đúng khuôn PlaceForm/ProposeEditForm dùng thật — TimeOfDayField
// không tự giữ `value`, cha truyền xuống và nhận lại qua onChange.
function Controlled({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <TimeOfDayField id="t1" value={value} onChange={setValue} ariaLabel="Giờ mở (HH:mm, 24 giờ) thử" />;
}

describe('TimeOfDayField', () => {
  it('gõ từng ký tự KHÔNG tự chèn/xoá gì — giá trị luôn đúng y hệt đã gõ (không nhảy con trỏ)', () => {
    render(<Controlled />);
    const input = screen.getByLabelText('Giờ mở (HH:mm, 24 giờ) thử');
    fireEvent.change(input, { target: { value: '1' } });
    expect(input).toHaveValue('1');
    fireEvent.change(input, { target: { value: '18' } });
    expect(input).toHaveValue('18');
    fireEvent.change(input, { target: { value: '18:' } });
    expect(input).toHaveValue('18:');
    fireEvent.change(input, { target: { value: '18:0' } });
    expect(input).toHaveValue('18:0');
  });

  it('chưa blur -> không hiện lỗi dù đang gõ dở (vd "18:")', () => {
    render(<Controlled />);
    const input = screen.getByLabelText('Giờ mở (HH:mm, 24 giờ) thử');
    fireEvent.change(input, { target: { value: '18:' } });
    expect(screen.queryByText(/Giờ không hợp lệ/)).not.toBeInTheDocument();
  });

  it('blur với giá trị hợp lệ thiếu số 0 -> chuẩn hoá "HH:mm"', () => {
    render(<Controlled />);
    const input = screen.getByLabelText('Giờ mở (HH:mm, 24 giờ) thử');
    fireEvent.change(input, { target: { value: '6:00' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('06:00');
    expect(screen.queryByText(/Giờ không hợp lệ/)).not.toBeInTheDocument();
  });

  it('blur với giá trị sai định dạng -> GIỮ NGUYÊN nội dung, hiện lỗi dưới ô', () => {
    render(<Controlled />);
    const input = screen.getByLabelText('Giờ mở (HH:mm, 24 giờ) thử');
    fireEvent.change(input, { target: { value: '25:00' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('25:00'); // không xoá, không tự đoán
    expect(screen.getByText(/Giờ không hợp lệ/)).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('gõ lại sau khi lỗi -> lỗi biến mất ngay (chờ blur lần sau mới kiểm lại)', () => {
    render(<Controlled />);
    const input = screen.getByLabelText('Giờ mở (HH:mm, 24 giờ) thử');
    fireEvent.change(input, { target: { value: '25:00' } });
    fireEvent.blur(input);
    expect(screen.getByText(/Giờ không hợp lệ/)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '18:00' } });
    expect(screen.queryByText(/Giờ không hợp lệ/)).not.toBeInTheDocument();
    fireEvent.blur(input);
    expect(screen.queryByText(/Giờ không hợp lệ/)).not.toBeInTheDocument();
  });

  it('ô trống -> blur KHÔNG hiện lỗi định dạng (trống là "thiếu", không phải "sai")', () => {
    render(<Controlled />);
    const input = screen.getByLabelText('Giờ mở (HH:mm, 24 giờ) thử');
    fireEvent.blur(input);
    expect(screen.queryByText(/Giờ không hợp lệ/)).not.toBeInTheDocument();
  });

  it('điền sẵn giá trị hợp lệ có sẵn -> hiển thị đúng, không báo lỗi', () => {
    render(<Controlled initial="18:00" />);
    expect(screen.getByLabelText('Giờ mở (HH:mm, 24 giờ) thử')).toHaveValue('18:00');
    expect(screen.queryByText(/Giờ không hợp lệ/)).not.toBeInTheDocument();
  });

  it('disabled -> không gõ được', () => {
    render(<TimeOfDayField id="t2" value="" onChange={jest.fn()} ariaLabel="Giờ mở thử" disabled />);
    expect(screen.getByLabelText('Giờ mở thử')).toBeDisabled();
  });
});
