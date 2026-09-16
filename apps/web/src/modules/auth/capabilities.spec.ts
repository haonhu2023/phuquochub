import { capabilitiesFromRoles, NO_CAPABILITIES } from './capabilities';

// Operator Bootstrap & Editorial Place Content (2026-08-12). Bảng ánh xạ này quyết định AI NHÌN
// THẤY lối vào đặc quyền. Nó KHÔNG cấp quyền (backend cưỡng chế), nhưng hiện nhầm lối vào cho
// người thường là một lỗi UX tệ (bấm vào chỉ để nhận 403), nên từng vai trò được khoá tường minh.
//
// canReviewTranslations (human-translation-review, 2026-09-04) và canSelfApproveOwnMedia
// (content_owner, 2026-09-16) thêm sau — mọi assertion dưới đây cập nhật để phản ánh cả bốn cờ.
describe('capabilitiesFromRoles', () => {
  it('member thường: KHÔNG thấy lối vào nào', () => {
    expect(capabilitiesFromRoles(['member'])).toEqual(NO_CAPABILITIES);
  });

  it.each([['business_owner'], ['business_manager'], ['local_guide'], ['guest'], ['ai_agent']])(
    'vai trò "%s" KHÔNG mở lối vào đặc quyền nào',
    (role) => {
      expect(capabilitiesFromRoles([role])).toEqual(NO_CAPABILITIES);
    },
  );

  it('contributor: biên tập được, nhưng KHÔNG kiểm duyệt/duyệt bản dịch/tự duyệt (đúng bộ quyền thật của vai trò này)', () => {
    expect(capabilitiesFromRoles(['contributor'])).toEqual({
      canEditorial: true,
      canModerate: false,
      canReviewTranslations: false,
      canSelfApproveOwnMedia: false,
    });
  });

  it.each([['moderator'], ['administrator'], ['super_administrator']])(
    'vai trò "%s": thấy biên tập, kiểm duyệt, duyệt bản dịch — nhưng KHÔNG tự duyệt (Media.Moderate.Own chỉ content_owner giữ)',
    (role) => {
      expect(capabilitiesFromRoles([role])).toEqual({
        canEditorial: true,
        canModerate: true,
        canReviewTranslations: true,
        canSelfApproveOwnMedia: false,
      });
    },
  );

  // content_owner (2026-09-16, mở rộng 2026-09-17) — role RIÊNG cho ngoại lệ INV-12 + duyệt bản
  // dịch + (mới) kiểm duyệt ẢNH của người khác qua GrantContentOwnerMediaModerationScope (cấp
  // TRỰC TIẾP Media.Moderate + Moderation.Queue.View, không kế thừa moderator). Biên tập được (qua
  // contributor), tự duyệt ảnh/bản dịch CỦA MÌNH, VÀ giờ thấy được Hàng chờ kiểm duyệt chung (quyết
  // định trên case KHÔNG PHẢI ảnh vẫn 403 ở backend — content_owner không có Review.Moderate).
  it('content_owner: biên tập + duyệt bản dịch + tự duyệt ảnh của mình + thấy hàng chờ kiểm duyệt (ảnh người khác)', () => {
    expect(capabilitiesFromRoles(['content_owner'])).toEqual({
      canEditorial: true,
      canModerate: true,
      canReviewTranslations: true,
      canSelfApproveOwnMedia: true,
    });
  });

  it('nhiều vai trò: hợp nhất theo kiểu "có ít nhất một là đủ"', () => {
    expect(capabilitiesFromRoles(['member', 'contributor'])).toEqual({
      canEditorial: true,
      canModerate: false,
      canReviewTranslations: false,
      canSelfApproveOwnMedia: false,
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
        canSelfApproveOwnMedia: false,
      });
    });

    it('tên vai trò lạ (backend thêm role mới) -> không tự mở lối vào nào', () => {
      expect(capabilitiesFromRoles(['some_future_role'])).toEqual(NO_CAPABILITIES);
    });
  });
});
