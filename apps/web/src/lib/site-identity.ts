/**
 * Danh tính và kênh liên hệ chính thức của bên vận hành PhuQuocHub.
 *
 * VÌ SAO FILE NÀY TỒN TẠI
 * -----------------------
 * Trang Chính sách bảo mật, Điều khoản sử dụng và Liên hệ đều cần MỘT nguồn sự thật duy nhất cho
 * danh tính bên vận hành. Những giá trị đó là dữ kiện pháp lý của Owner — chúng KHÔNG thể suy ra
 * từ mã nguồn, và tuyệt đối không được bịa. Vì vậy chúng được tập trung ở đây, mặc định `null`,
 * thay vì rải chuỗi giả (`example@example.com`, `[Company Name]`) khắp các trang.
 *
 * Khi `operatorContact.email` còn `null`, các trang pháp lý sẽ hiển thị một thông báo trung thực
 * rằng kênh liên hệ chính thức chưa được công bố — đó là mô tả đúng hiện trạng, không phải
 * placeholder giả.
 *
 * CẦN OWNER CUNG CẤP TRƯỚC KHI MỞ CÔNG KHAI
 * -----------------------------------------
 * Điền các giá trị dưới đây rồi chạy lại `npm run test --workspace=@phuquochub/web`. Bộ test
 * `site-identity.spec.ts` sẽ tự động chuyển sang kiểm tra định dạng thật khi giá trị khác `null`.
 *
 *   1. email        — hộp thư nhận yêu cầu về dữ liệu cá nhân và khiếu nại nội dung (BẮT BUỘC)
 *   2. legalName    — tên cá nhân/tổ chức chịu trách nhiệm vận hành (BẮT BUỘC)
 *   3. address      — địa chỉ liên hệ được phép công bố (khuyến nghị)
 *   4. governingLaw — quốc gia/vùng luật áp dụng cho Điều khoản (BẮT BUỘC cho Điều khoản)
 *   5. responseTime — cam kết thời gian phản hồi, ví dụ "trong vòng 30 ngày" (khuyến nghị)
 *
 * KHÔNG điền dữ liệu phỏng đoán. Một chính sách bảo mật ghi sai bên chịu trách nhiệm còn tệ hơn
 * một chính sách chưa công bố kênh liên hệ.
 */
export interface OperatorContact {
  /** Hộp thư công khai để người dùng thực hiện quyền với dữ liệu cá nhân. */
  readonly email: string | null;
  /** Tên cá nhân hoặc tổ chức chịu trách nhiệm vận hành dịch vụ. */
  readonly legalName: string | null;
  /** Địa chỉ liên hệ công khai, nếu Owner đồng ý công bố. */
  readonly address: string | null;
  /** Hệ thống pháp luật điều chỉnh Điều khoản sử dụng. */
  readonly governingLaw: string | null;
  /** Cam kết thời hạn phản hồi yêu cầu của người dùng. */
  readonly responseTime: string | null;
}

export const operatorContact: OperatorContact = {
  email: null,
  legalName: null,
  address: null,
  governingLaw: null,
  responseTime: null,
};

/**
 * `true` khi đã có tối thiểu kênh liên hệ để người dùng thực hiện quyền với dữ liệu của mình.
 * Email là ngưỡng tối thiểu: thiếu nó, người dùng không có cách nào yêu cầu truy cập hay xoá dữ liệu.
 */
export function hasPublishedContact(contact: OperatorContact = operatorContact): boolean {
  return typeof contact.email === 'string' && contact.email.length > 0;
}

/** Ngày cập nhật gần nhất của bộ tài liệu pháp lý — cập nhật thủ công khi sửa nội dung. */
export const LEGAL_LAST_UPDATED = '2026-08-15';
