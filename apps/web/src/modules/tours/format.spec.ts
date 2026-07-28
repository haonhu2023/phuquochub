import { formatDifficulty, formatDuration, formatTourType } from './format';

describe('formatDuration', () => {
  it.each([
    [45, '45 phút'],
    [60, '1 giờ'],
    [90, '1 giờ 30 phút'],
    [240, '4 giờ'],
    [480, '8 giờ'],
  ])('%p phút → %p', (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected);
  });

  it.each([null, undefined, 0, -30, Number.NaN])('giá trị không dùng được (%p) → null', (value) => {
    expect(formatDuration(value as number | null | undefined)).toBeNull();
  });
});

describe('formatTourType / formatDifficulty', () => {
  it('nhãn tiếng Việt cho giá trị enum đã biết', () => {
    expect(formatTourType('diving')).toBe('Lặn biển');
    expect(formatDifficulty('moderate')).toBe('Trung bình');
  });

  it('giá trị lạ → giữ nguyên chuỗi (không nuốt dữ liệu backend)', () => {
    expect(formatTourType('kayaking')).toBe('kayaking');
    expect(formatDifficulty('extreme')).toBe('extreme');
  });

  it('null/rỗng → null', () => {
    expect(formatTourType(null)).toBeNull();
    expect(formatDifficulty('')).toBeNull();
  });
});
