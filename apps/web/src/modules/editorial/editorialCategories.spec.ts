import { editorialPublicDetailHref, getEditorialCategory } from './editorialCategories';

it.each([
  ['hotel', 'Khách sạn và resort', '/hotels/h1'],
  ['resort', 'Khách sạn và resort', '/hotels/h1'],
  ['restaurant', 'Nhà hàng và ăn uống', '/restaurants/h1'],
  ['attraction', 'Điểm tham quan và khu vui chơi', '/places/h1'],
  ['beach', 'Bãi biển', '/places/h1'],
])('%s có hướng dẫn và đường chi tiết công khai đúng', (slug, title, href) => {
  expect(getEditorialCategory(slug)?.title).toBe(title);
  expect(editorialPublicDetailHref(slug, 'h1')).toBe(href);
});

it('danh mục lạ không bị gán nhầm dữ kiện', () => {
  expect(getEditorialCategory('market')).toBeNull();
  expect(editorialPublicDetailHref('market', 'm1')).toBe('/places/m1');
});
