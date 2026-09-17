import { categoryNameLookup } from './categoryName';
import type { Category } from './api/categories.api';

const CATEGORIES: Category[] = [
  { id: 'c1', slug: 'hotel', name_vi: 'Khách sạn', name_en: 'Hotel', icon: null, parent_id: null },
  { id: 'c2', slug: 'cafe', name_vi: 'Quán cà phê', name_en: null, parent_id: null, icon: null },
];

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
