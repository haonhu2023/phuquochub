import { generateBookingCode } from './booking-code';

describe('generateBookingCode', () => {
  it('sinh mã dài 8 ký tự', () => {
    expect(generateBookingCode()).toHaveLength(8);
  });

  it('chỉ dùng bảng chữ đã bỏ ký tự dễ nhầm (0/O/1/I/L)', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateBookingCode()).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
    }
  });

  it('không sinh ra hai mã giống hệt nhau trên một loạt lớn (xác suất cực thấp)', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateBookingCode()));
    expect(codes.size).toBe(200);
  });
});
