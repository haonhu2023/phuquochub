/**
 * Phường/xã của Phú Quốc dùng cho các bộ lọc "khu vực" trên trang duyệt.
 *
 * `places.ward` là varchar TỰ DO và KHÔNG có endpoint tra cứu danh sách ward — danh sách dưới
 * đây được chốt theo đúng tập giá trị đã seed trong SeedInitialPlaces/SeedPlacesExpansion. Thêm
 * ward mới ở seed/migration sau này thì phải cập nhật ở đây; backend KHÔNG whitelist nên ward
 * lạ vẫn lọc đúng, chỉ là dropdown chưa có lựa chọn đó.
 *
 * Tách ra dùng chung khi có consumer THỨ BA (Tours "khu vực khởi hành", Attractions "khu vực",
 * Beaches "khu vực") — đúng ngưỡng đã ghi trong ghi chú của TourFilters/AttractionFilters:
 * hai nơi thì để trùng lặp, ba nơi cùng một tập giá trị và cùng hợp đồng (mảng chuỗi khớp
 * `places.ward`) thì mới đáng trích ra.
 */
export const PHU_QUOC_WARDS: readonly string[] = [
  'An Thới',
  'Bãi Thơm',
  'Cửa Cạn',
  'Cửa Dương',
  'Dương Đông',
  'Dương Tơ',
  'Gành Dầu',
  'Hàm Ninh',
];
