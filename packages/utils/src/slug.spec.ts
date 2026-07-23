import { removeVietnameseTones, slugify } from './slug';

describe('removeVietnameseTones', () => {
  it('bỏ dấu tiếng Việt', () => {
    expect(removeVietnameseTones('Phú Quốc')).toBe('phu quoc');
    expect(removeVietnameseTones('Bãi Sao')).toBe('bai sao');
    expect(removeVietnameseTones('Đảo Ngọc')).toBe('dao ngoc');
  });
});

describe('slugify', () => {
  it('sinh slug URL-safe từ tiếng Việt', () => {
    expect(slugify('Bãi Sao — Phú Quốc')).toBe('bai-sao-phu-quoc');
    expect(slugify('Nhà hàng Hải Sản 5 Sao')).toBe('nha-hang-hai-san-5-sao');
  });

  it('gộp khoảng trắng và gạch nối thừa', () => {
    expect(slugify('  Dương   Đông  ')).toBe('duong-dong');
    expect(slugify('A---B')).toBe('a-b');
  });

  it('bỏ ký tự đặc biệt', () => {
    expect(slugify('Cầu Cảng @ An Thới!')).toBe('cau-cang-an-thoi');
  });
});
