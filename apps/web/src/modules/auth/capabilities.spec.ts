import { capabilitiesFromRoles, NO_CAPABILITIES } from './capabilities';

// Operator Bootstrap & Editorial Place Content (2026-08-12). Bảng ánh xạ này quyết định AI NHÌN
// THẤY lối vào đặc quyền. Nó KHÔNG cấp quyền (backend cưỡng chế), nhưng hiện nhầm lối vào cho
// người thường là một lỗi UX tệ (bấm vào chỉ để nhận 403), nên từng vai trò được khoá tường minh.
describe('capabilitiesFromRoles', () => {
  it('member thường: KHÔNG thấy lối vào biên tập lẫn kiểm duyệt', () => {
    expect(capabilitiesFromRoles(['member'])).toEqual({ canEditorial: false, canModerate: false });
  });

  it.each([['business_owner'], ['business_manager'], ['local_guide'], ['guest'], ['ai_agent']])(
    'vai trò "%s" KHÔNG mở lối vào đặc quyền nào',
    (role) => {
      expect(capabilitiesFromRoles([role])).toEqual({ canEditorial: false, canModerate: false });
    },
  );

  it('contributor: biên tập được, nhưng KHÔNG kiểm duyệt (đúng bộ quyền thật của vai trò này)', () => {
    expect(capabilitiesFromRoles(['contributor'])).toEqual({ canEditorial: true, canModerate: false });
  });

  it.each([['moderator'], ['administrator'], ['super_administrator']])(
    'vai trò "%s": thấy CẢ biên tập lẫn kiểm duyệt',
    (role) => {
      expect(capabilitiesFromRoles([role])).toEqual({ canEditorial: true, canModerate: true });
    },
  );

  it('nhiều vai trò: hợp nhất theo kiểu "có ít nhất một là đủ"', () => {
    expect(capabilitiesFromRoles(['member', 'contributor'])).toEqual({
      canEditorial: true,
      canModerate: false,
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
      });
    });

    it('tên vai trò lạ (backend thêm role mới) -> không tự mở lối vào nào', () => {
      expect(capabilitiesFromRoles(['some_future_role'])).toEqual(NO_CAPABILITIES);
    });
  });
});
