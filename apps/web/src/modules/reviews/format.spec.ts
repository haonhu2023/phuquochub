import type { PlaceMedia } from '@phuquochub/shared-types';
import { formatReviewDate, ratingStars, reviewMediaAlt, reviewMediaSrc } from './format';

function media(overrides: Partial<PlaceMedia> = {}): PlaceMedia {
  return {
    id: 'm1',
    type: 'image',
    url: 'https://media.phuquochub.com/phuquochub-prod/media/a.jpg',
    thumbnail_url: null,
    caption: null,
    alt_text: null,
    status: 'published',
    ...overrides,
  };
}

describe('ratingStars', () => {
  it.each([
    [0, [false, false, false, false, false]],
    [3, [true, true, true, false, false]],
    [5, [true, true, true, true, true]],
  ])('rating %p → %p', (rating, expected) => {
    expect(ratingStars(rating)).toEqual(expected);
  });
});

describe('formatReviewDate', () => {
  it('định dạng ISO string theo vi-VN (ngày tháng năm)', () => {
    expect(formatReviewDate('2026-07-26T00:00:00Z')).toContain('2026');
  });
});

describe('reviewMediaSrc', () => {
  it('ưu tiên thumbnail_url khi có', () => {
    const m = media({ thumbnail_url: 'https://media.phuquochub.com/thumb.jpg', url: 'https://media.phuquochub.com/full.jpg' });
    expect(reviewMediaSrc(m)).toBe('https://media.phuquochub.com/thumb.jpg');
  });

  it('dùng url khi không có thumbnail_url', () => {
    expect(reviewMediaSrc(media({ thumbnail_url: null, url: 'https://media.phuquochub.com/full.jpg' }))).toBe(
      'https://media.phuquochub.com/full.jpg',
    );
  });

  it('trả null khi cả hai đều rỗng/khoảng trắng (dữ liệu hỏng) — không render <img src="">', () => {
    expect(reviewMediaSrc(media({ thumbnail_url: null, url: '' }))).toBeNull();
    expect(reviewMediaSrc(media({ thumbnail_url: '   ', url: '  ' }))).toBeNull();
  });
});

describe('reviewMediaAlt', () => {
  it('ưu tiên alt_text', () => {
    expect(reviewMediaAlt(media({ alt_text: 'Bãi biển lúc hoàng hôn', caption: 'Caption' }))).toBe(
      'Bãi biển lúc hoàng hôn',
    );
  });

  it('dùng caption khi không có alt_text', () => {
    expect(reviewMediaAlt(media({ alt_text: null, caption: 'Món ăn ngon' }))).toBe('Món ăn ngon');
  });

  it('dùng nhãn mặc định khi cả hai đều rỗng', () => {
    expect(reviewMediaAlt(media({ alt_text: null, caption: null }))).toBe('Ảnh đánh giá');
  });
});
