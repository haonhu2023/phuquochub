import { capabilitiesFromRoles, NO_CAPABILITIES } from './capabilities';

// Operator Bootstrap & Editorial Place Content (2026-08-12). Bảng ánh xạ này quyết định AI NHÌN
// THẤY lối vào đặc quyền. Nó KHÔNG cấp quyền (backend cưỡng chế), nhưng hiện nhầm lối vào cho
// người thường là một lỗi UX tệ (bấm vào chỉ để nhận 403), nên từng vai trò được khoá tường minh.
//
// canReviewTranslations (human-translation-review, 2026-09-04) và canEditGuides (Guide CMS
// candidate, 2026-09-18) thêm sau, dùng CÙNG tập vai trò với canModerate hôm nay — mọi assertion
// dưới đây cập nhật để phản ánh cả bốn cờ.
describe('capabilitiesFromRoles', () => {
  it('member thường: KHÔNG thấy lối vào biên tập, kiểm duyệt, duyệt bản dịch, hay biên tập cẩm nang', () => {
    expect(capabilitiesFromRoles(['member'])).toEqual({
      canEditorial: false,
      canModerate: false,
      canReviewTranslations: false,
      canEditGuides: false,
      canEditSiteContent: false,
    });
  });

  it.each([['business_owner'], ['business_manager'], ['local_guide'], ['guest'], ['ai_agent']])(
    'vai trò "%s" KHÔNG mở lối vào đặc quyền nào',
    (role) => {
      expect(capabilitiesFromRoles([role])).toEqual({
        canEditorial: false,
        canModerate: false,
        canReviewTranslations: false,
        canEditGuides: false,
        canEditSiteContent: false,
      });
    },
  );

  it('contributor: biên tập được, nhưng KHÔNG kiểm duyệt/duyệt bản dịch/biên tập cẩm nang (đúng bộ quyền thật của vai trò này)', () => {
    expect(capabilitiesFromRoles(['contributor'])).toEqual({
      canEditorial: true,
      canModerate: false,
      canReviewTranslations: false,
      canEditGuides: false,
      canEditSiteContent: false,
    });
  });

  it.each([['moderator'], ['administrator'], ['super_administrator']])(
    'vai trò "%s": thấy CẢ biên tập, kiểm duyệt, duyệt bản dịch, lẫn biên tập cẩm nang',
    (role) => {
      expect(capabilitiesFromRoles([role])).toEqual({
        canEditorial: true,
        canModerate: true,
        canReviewTranslations: true,
        canEditGuides: true,
        canEditSiteContent: false,
      });
    },
  );

  // content_owner (SeedContentOwnerRole, launch-readiness 2026-09-22) giữ trực tiếp cả 4 permission
  // đằng sau 4 cờ này — phát hiện qua đăng nhập thật (browser smoke test) rằng thiếu dòng này khiến
  // owner có đủ quyền API nhưng dashboard KHÔNG hiện lối vào nào, y như một member trơn.
  // canEditSiteContent (S1, 2026-09-22): content_owner là vai trò DUY NHẤT giữ SiteContent.Edit.
  it('content_owner: thấy CẢ biên tập, kiểm duyệt, duyệt bản dịch, biên tập cẩm nang, lẫn nội dung website', () => {
    expect(capabilitiesFromRoles(['content_owner'])).toEqual({
      canEditorial: true,
      canModerate: true,
      canReviewTranslations: true,
      canEditGuides: true,
      canEditSiteContent: true,
    });
  });

  it('moderator/administrator/super_administrator: KHÔNG thấy lối vào nội dung website (SiteContent.Edit chỉ cấp cho content_owner)', () => {
    for (const role of ['moderator', 'administrator', 'super_administrator']) {
      expect(capabilitiesFromRoles([role]).canEditSiteContent).toBe(false);
    }
  });

  it('nhiều vai trò: hợp nhất theo kiểu "có ít nhất một là đủ"', () => {
    expect(capabilitiesFromRoles(['member', 'contributor'])).toEqual({
      canEditorial: true,
      canModerate: false,
      canReviewTranslations: false,
      canEditGuides: false,
      canEditSiteContent: false,
    });
  });

  // Giá trị đến TỪ MẠNG — mọi hình dạng bất ngờ phải dẫn tới "ẩn hết", không bao giờ tới "hiện hết"
  // và không bao giờ ném lỗi làm hỏng cả trang bảng điều khiển.
  describe('fail closed với dữ liệu không hợp lệ', () => {
    it.each([[null], [undefined], ['moderator' as unknown], [{}], [0]])(
      'giá trị %p (không phải mảng) -> không có năng lực nào',
      (value) => {
        expect(capabilitiesFromRoles(value as never)).toEqual(NO_CAPABILITIES);
      },
    );

    it('mảng rỗng -> không có năng lực nào', () => {
      expect(capabilitiesFromRoles([])).toEqual(NO_CAPABILITIES);
    });

    it('phần tử không phải chuỗi bị bỏ qua, không ném lỗi', () => {
      expect(capabilitiesFromRoles([null, 42, {}, 'contributor'])).toEqual({
        canEditorial: true,
        canModerate: false,
        canReviewTranslations: false,
        canEditGuides: false,
        canEditSiteContent: false,
      });
    });

    it('tên vai trò lạ (backend thêm role mới) -> không tự mở lối vào nào', () => {
      expect(capabilitiesFromRoles(['some_future_role'])).toEqual(NO_CAPABILITIES);
    });
  });
});
