/** Hướng dẫn biên tập, không phải dữ kiện công khai về một cơ sở cụ thể. */
export const EDITORIAL_CATEGORIES = {
  hotel: {
    title: 'Khách sạn và resort',
    intro: 'Giúp khách chọn nơi ở: vị trí, loại hình lưu trú, tiện nghi và cách liên hệ.',
    shortPrompt: 'Loại lưu trú, khu vực và điểm nổi bật đã kiểm chứng của cơ sở.',
    detailPrompt: 'Ghi vị trí thực tế, loại phòng và tiện nghi có bằng chứng; nêu điều kiện di chuyển hoặc nhận phòng nếu đã kiểm tra.',
    checklist: ['Vị trí và đường tới nơi ở', 'Ảnh đúng cơ sở và quyền sử dụng', 'Loại phòng, tiện nghi đã kiểm tra', 'Liên hệ và giờ nhận phòng nếu có nguồn'],
    publicPath: 'hotels',
  },
  restaurant: {
    title: 'Nhà hàng và ăn uống',
    intro: 'Giúp khách chọn nơi ăn: món thực tế, địa chỉ, giờ phục vụ và cách liên hệ.',
    shortPrompt: 'Loại món, khu vực và đặc điểm thực tế của quán hoặc nhà hàng.',
    detailPrompt: 'Nêu món hoặc phong cách ẩm thực đã đối chiếu, địa chỉ, giờ phục vụ và cách đặt bàn nếu có thông tin đáng tin.',
    checklist: ['Món hoặc ẩm thực có thật', 'Giờ phục vụ đã đối chiếu', 'Địa chỉ và cách tìm đường', 'Ảnh món/quán có quyền sử dụng'],
    publicPath: 'restaurants',
  },
  attraction: {
    title: 'Điểm tham quan và khu vui chơi',
    intro: 'Giúp khách lên lịch trình: hoạt động thực tế, thời gian tham quan, cách đi và lưu ý.',
    shortPrompt: 'Trải nghiệm chính, khu vực và đối tượng phù hợp theo nguồn đã kiểm tra.',
    detailPrompt: 'Mô tả hoạt động thực tế, đường đi, thời lượng tham quan, giờ vận hành và lưu ý an toàn khi đã xác minh.',
    checklist: ['Hoạt động và thời lượng phù hợp', 'Lối vào và vị trí chính xác', 'Giờ hoạt động có nguồn', 'Lưu ý an toàn cụ thể nếu có'],
    publicPath: 'attractions',
  },
  beach: {
    title: 'Bãi biển',
    intro: 'Giúp khách biết đường ra bãi, điều kiện tắm biển và tiện ích thực tế.',
    shortPrompt: 'Khu vực, đường tiếp cận và điểm nổi bật có thật của bãi biển.',
    detailPrompt: 'Nêu cách tiếp cận, đặc điểm bãi, tiện ích và lưu ý an toàn theo thông tin đã kiểm tra; không khẳng định biển an toàn quanh năm.',
    checklist: ['Đường xuống bãi và vị trí', 'Tiện ích đang có thật', 'Lưu ý dòng chảy, sóng theo nguồn hiện hành', 'Ảnh đúng bãi và quyền sử dụng'],
    publicPath: 'beaches',
  },
} as const;

export type EditorialCategory = keyof typeof EDITORIAL_CATEGORIES;

export function getEditorialCategory(slug: string | null | undefined) {
  const key = slug === 'resort' ? 'hotel' : slug;
  return key && Object.prototype.hasOwnProperty.call(EDITORIAL_CATEGORIES, key)
    ? EDITORIAL_CATEGORIES[key as EditorialCategory]
    : null;
}

export function editorialPublicDetailHref(categorySlug: string | null | undefined, placeSlug: string): string {
  const path = getEditorialCategory(categorySlug)?.publicPath;
  const section = path === 'hotels' || path === 'restaurants' ? path : 'places';
  return `/${section}/${encodeURIComponent(placeSlug)}`;
}
