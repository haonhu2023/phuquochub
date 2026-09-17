import { isEnDetailIndexable } from './seo';

// EN indexation gate v2 (entity-aware) — trước bản này, `isEnDetailIndexable` khoá cứng `false`
// toàn cục bất kể slug. Giờ đây quyết định index dựa THẲNG vào hai cờ công khai thật của bản dịch
// EN (`display_name`/`short_description`, mỗi cờ chỉ `true` khi translation đang `is_current` +
// `is_public` + `is_production_data` — tức đã qua kiểm duyệt người thật, không phải chỉ TỒN TẠI
// một hàng translation). Test theo đúng ma trận A-E của tác vụ EN indexation gate.
describe('isEnDetailIndexable (EN indexation gate v2)', () => {
  it('A: cả display_name và short_description tiếng Anh đều đã duyệt/công khai → indexable', () => {
    expect(
      isEnDetailIndexable({ displayNameEnApproved: true, shortDescriptionEnApproved: true }),
    ).toBe(true);
  });

  it('B: tên đã duyệt nhưng mô tả còn PENDING (chưa duyệt) → không index', () => {
    expect(
      isEnDetailIndexable({ displayNameEnApproved: true, shortDescriptionEnApproved: false }),
    ).toBe(false);
  });

  it('C: mô tả đã duyệt nhưng tên còn PENDING (chưa duyệt) → không index', () => {
    expect(
      isEnDetailIndexable({ displayNameEnApproved: false, shortDescriptionEnApproved: true }),
    ).toBe(false);
  });

  it('D: có bản dịch EN nhưng cả hai còn PENDING → không index (input false/false)', () => {
    expect(
      isEnDetailIndexable({ displayNameEnApproved: false, shortDescriptionEnApproved: false }),
    ).toBe(false);
  });

  it('E: REJECTED/NEEDS_CHANGES tự nhiên rơi về false ở nguồn (API chỉ trả true cho APPROVED+public) — input false/false → không index', () => {
    // API không có trạng thái riêng "rejected" cho hàm này — REJECTED/NEEDS_CHANGES đều khiến
    // `en_*_approved` là false ngay từ API (không current+public), nên bài test này khoá đúng
    // hành vi khi cả hai cờ đều false, dùng chung với case D — không có nhánh code riêng nào để
    // phân biệt "PENDING" với "REJECTED" ở tầng web, đúng như thiết kế (chỉ có approved/không).
    expect(
      isEnDetailIndexable({ displayNameEnApproved: false, shortDescriptionEnApproved: false }),
    ).toBe(false);
  });

  it('không có input (undefined) → không index, không throw', () => {
    expect(isEnDetailIndexable(undefined)).toBe(false);
  });

  it('input null → không index, không throw', () => {
    expect(isEnDetailIndexable(null)).toBe(false);
  });
});
