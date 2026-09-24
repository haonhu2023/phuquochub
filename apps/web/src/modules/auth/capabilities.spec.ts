import { capabilitiesFromRoles, NO_CAPABILITIES } from './capabilities';

// Operator Bootstrap & Editorial Place Content (2026-08-12). Bảng ánh xạ này quyết định AI NHÌN
// THẤY lối vào đặc quyền. Nó KHÔNG cấp quyền (backend cưỡng chế), nhưng hiện nhầm lối vào cho
// người thường là một lỗi UX tệ (bấm vào chỉ để nhận 403), nên từng vai trò được khoá tường minh.
//
// canReviewTranslations (human-translation-review, 2026-09-04), canSelfApproveOwnMedia
// (content_owner, 2026-09-16), canEditGuides (Guide CMS candidate, 2026-09-18), canEditSiteContent
// và canViewBackupStatus (launch-readiness pass, 2026-09-22), canViewOwnerTodo (trang "Việc cần
// làm", 2026-09-24) thêm sau — mọi assertion dưới đây cập nhật để phản ánh đủ tám cờ.
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

  it('contributor: biên tập được, nhưng KHÔNG kiểm duyệt/duyệt bản dịch/tự duyệt/biên tập cẩm nang (đúng bộ quyền thật của vai trò này)', () => {
    expect(capabilitiesFromRoles(['contributor'])).toEqual({
      canEditorial: true,
      canModerate: false,
      canReviewTranslations: false,
      canSelfApproveOwnMedia: false,
      canEditGuides: false,
      canEditSiteContent: false,
      canViewBackupStatus: false,
      canViewOwnerTodo: false,
    });
  });

  it.each([['moderator'], ['administrator'], ['super_administrator']])(
    'vai trò "%s": thấy biên tập, kiểm duyệt, duyệt bản dịch, biên tập cẩm nang, việc cần làm (Place.Approve) — nhưng KHÔNG tự duyệt (Media.Moderate.Own chỉ content_owner giữ), KHÔNG nội dung website/tình trạng sao lưu',
    (role) => {
      expect(capabilitiesFromRoles([role])).toEqual({
        canEditorial: true,
        canModerate: true,
        canReviewTranslations: true,
        canSelfApproveOwnMedia: false,
        canEditGuides: true,
        canEditSiteContent: false,
        canViewBackupStatus: false,
        canViewOwnerTodo: true,
      });
    },
  );

  // content_owner (2026-09-16, mở rộng 2026-09-17, 2026-09-22) — role RIÊNG cho ngoại lệ INV-12 +
  // duyệt bản dịch + kiểm duyệt ẢNH của người khác qua GrantContentOwnerMediaModerationScope (cấp
  // TRỰC TIẾP Media.Moderate + Moderation.Queue.View, không kế thừa moderator), CỘNG Guide.Edit.Any/
  // SiteContent.Edit/Ops.BackupStatus.View (SeedContentOwnerRole, launch-readiness 2026-09-22) —
  // phát hiện qua đăng nhập thật (browser smoke test) rằng thiếu các dòng sau khiến owner có đủ
  // quyền API nhưng dashboard KHÔNG hiện lối vào nào, y như một member trơn.
  it('content_owner: thấy CẢ biên tập, kiểm duyệt, duyệt bản dịch, tự duyệt ảnh của mình, biên tập cẩm nang, nội dung website, tình trạng sao lưu, lẫn việc cần làm', () => {
    expect(capabilitiesFromRoles(['content_owner'])).toEqual({
      canEditorial: true,
      canModerate: true,
      canReviewTranslations: true,
      canSelfApproveOwnMedia: true,
      canEditGuides: true,
      canEditSiteContent: true,
      canViewBackupStatus: true,
      canViewOwnerTodo: true,
    });
  });

  it('moderator/administrator/super_administrator: KHÔNG thấy lối vào nội dung website hay tình trạng sao lưu (cả hai chỉ cấp cho content_owner)', () => {
    for (const role of ['moderator', 'administrator', 'super_administrator']) {
      expect(capabilitiesFromRoles([role]).canEditSiteContent).toBe(false);
      expect(capabilitiesFromRoles([role]).canViewBackupStatus).toBe(false);
    }
  });

  it('nhiều vai trò: hợp nhất theo kiểu "có ít nhất một là đủ"', () => {
    expect(capabilitiesFromRoles(['member', 'contributor'])).toEqual({
      canEditorial: true,
      canModerate: false,
      canReviewTranslations: false,
      canSelfApproveOwnMedia: false,
      canEditGuides: false,
      canEditSiteContent: false,
      canViewBackupStatus: false,
      canViewOwnerTodo: false,
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
        canEditGuides: false,
        canEditSiteContent: false,
        canViewBackupStatus: false,
        canViewOwnerTodo: false,
      });
    });

    it('tên vai trò lạ (backend thêm role mới) -> không tự mở lối vào nào', () => {
      expect(capabilitiesFromRoles(['some_future_role'])).toEqual(NO_CAPABILITIES);
    });
  });
});
