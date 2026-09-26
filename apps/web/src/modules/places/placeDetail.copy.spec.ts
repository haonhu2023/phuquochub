import { getPlaceAboutTitle } from './placeDetail.copy';

it('bãi biển và khu vui chơi dùng tiêu đề đúng danh mục, đúng ngôn ngữ', () => {
  expect(getPlaceAboutTitle('vi', 'beach')).toBe('Về bãi biển này');
  expect(getPlaceAboutTitle('en', 'beach')).toBe('About this beach');
  expect(getPlaceAboutTitle('vi', 'attraction')).toBe('Có gì để tham quan, vui chơi');
  expect(getPlaceAboutTitle('en', 'attraction')).toBe('What to see and do');
  expect(getPlaceAboutTitle('vi', null)).toBe('Giới thiệu');
});
