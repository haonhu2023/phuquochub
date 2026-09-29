import { resolveMetaDescription, resolveMetaTitle } from './seoMeta';

describe('resolveMetaTitle', () => {
  it('uses metaTitle when set', () => {
    expect(resolveMetaTitle('Tiêu đề SEO riêng', 'Tiêu đề bài')).toBe('Tiêu đề SEO riêng');
  });

  it('falls back to title when metaTitle is null', () => {
    expect(resolveMetaTitle(null, 'Tiêu đề bài')).toBe('Tiêu đề bài');
  });

  it('falls back to title when metaTitle is undefined', () => {
    expect(resolveMetaTitle(undefined, 'Tiêu đề bài')).toBe('Tiêu đề bài');
  });

  it('falls back to title when metaTitle is whitespace-only', () => {
    expect(resolveMetaTitle('   ', 'Tiêu đề bài')).toBe('Tiêu đề bài');
  });
});

describe('resolveMetaDescription', () => {
  it('uses metaDescription when set', () => {
    expect(resolveMetaDescription('Mô tả SEO riêng', 'Giới thiệu ngắn')).toBe('Mô tả SEO riêng');
  });

  it('falls back to intro when metaDescription is null', () => {
    expect(resolveMetaDescription(null, 'Giới thiệu ngắn')).toBe('Giới thiệu ngắn');
  });

  it('falls back to undefined when both are absent', () => {
    expect(resolveMetaDescription(null, null)).toBeUndefined();
    expect(resolveMetaDescription(undefined, undefined)).toBeUndefined();
  });

  it('falls back to intro when metaDescription is whitespace-only', () => {
    expect(resolveMetaDescription('   ', 'Giới thiệu ngắn')).toBe('Giới thiệu ngắn');
  });
});
