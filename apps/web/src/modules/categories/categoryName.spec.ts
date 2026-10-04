import { categoryNameLookup, categorySlugLookup } from './categoryName';
import type { Category } from './api/categories.api';

const CATEGORIES: Category[] = [
  { id: 'c1', slug: 'hotel', name_vi: 'Khách sạn', name_en: 'Hotel', icon: null, parent_id: null },
  { id: 'c2', slug: 'cafe', name_vi: 'Quán cà phê', name_en: null, parent_id: null, icon: null },
];

describe('categorySlugLookup', () => {
  it('trả slug đúng cho id đã biết, không phụ thuộc locale', () => {
    const lookup = categorySlugLookup(CATEGORIES);
    expect(lookup('c1')).toBe('hotel');
    expect(lookup('c2')).toBe('cafe');
  });

  it('id không có trong danh mục → null (không đoán slug)', () => {
    expect(categorySlugLookup(CATEGORIES)('c-khong-co')).toBeNull();
  });
});

describe('categoryNameLookup', () => {
  it('vi -> trả đúng name_vi', () => {
    const lookup = categoryNameLookup(CATEGORIES, 'vi');
    expect(lookup('c1')).toBe('Khách sạn');
  });

  it('en -> trả đúng name_en', () => {
    const lookup = categoryNameLookup(CATEGORIES, 'en');
    expect(lookup('c1')).toBe('Hotel');
  });

  it('en, name_en null -> fallback về name_vi (không hiện rỗng)', () => {
    const lookup = categoryNameLookup(CATEGORIES, 'en');
    expect(lookup('c2')).toBe('Quán cà phê');
  });

  it('category_id không có trong danh sách -> null (không bịa tên)', () => {
    const lookup = categoryNameLookup(CATEGORIES, 'vi');
    expect(lookup('unknown')).toBeNull();
  });

  it('danh sách category rỗng -> luôn null', () => {
    const lookup = categoryNameLookup([], 'vi');
    expect(lookup('c1')).toBeNull();
  });
});
