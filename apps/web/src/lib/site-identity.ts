/**
 * Danh tính và kênh liên hệ chính thức của bên vận hành PhuQuocHub.
 *
 * VÌ SAO FILE NÀY TỒN TẠI
 * -----------------------
 * Trang Chính sách bảo mật, Điều khoản sử dụng và Liên hệ đều cần MỘT nguồn sự thật duy nhất cho
 * danh tính bên vận hành. Những giá trị đó là dữ kiện pháp lý của Owner — chúng KHÔNG thể suy ra
 * từ mã nguồn, và tuyệt đối không được bịa. Vì vậy chúng được tập trung ở đây thay vì rải chuỗi
 * giả (`example@example.com`, `[Company Name]`) khắp các trang.
 *
 * TRẠNG THÁI: đã được Owner xác nhận và công bố (2026-08-16).
 *
 * `address` vẫn để `null` một cách CÓ CHỦ ĐÍCH: Owner chưa đồng ý công bố địa chỉ. Đây không phải
 * placeholder còn sót — các trang sẽ đơn giản là không hiển thị dòng địa chỉ. Nếu sau này cần công
 * bố (ví dụ khi đăng ký hộ kinh doanh/doanh nghiệp), điền vào đây là đủ, không phải sửa trang nào.
 *
 * QUY TẮC KHI SỬA FILE NÀY
 * ------------------------
 * KHÔNG điền dữ liệu phỏng đoán. Một chính sách bảo mật ghi sai bên chịu trách nhiệm còn tệ hơn
 * một chính sách chưa công bố kênh liên hệ. Sau khi sửa, chạy lại
 * `npm run test --workspace=@phuquochub/web` — `legal.spec.tsx` kiểm tra cả định dạng lẫn việc
 * không có giá trị "tạm" nào lọt vào.
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
  email: 'nhuhaophuquoc@gmail.com',
  legalName: 'Đàm Văn Hảo',
  // Owner chưa công bố địa chỉ — xem ghi chú ở đầu file.
  address: null,
  governingLaw: 'Pháp luật Việt Nam',
  // KHÔNG hứa một mốc "30 ngày" chung chung. Pháp luật Việt Nam về bảo vệ dữ liệu cá nhân
  // (Luật số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP) tự đặt thời hạn cho từng loại yêu cầu, và
  // thời hạn đó ngắn hơn mốc 30 ngày quen thuộc của GDPR. Câu chữ ở đây trỏ về thời hạn luật định
  // thay vì tự đặt ra một con số có thể sai hoặc không thực hiện nổi.
  responseTime: 'Trong thời hạn luật định theo pháp luật Việt Nam về bảo vệ dữ liệu cá nhân',
};

/**
 * `true` khi đã có tối thiểu kênh liên hệ để người dùng thực hiện quyền với dữ liệu của mình.
 * Email là ngưỡng tối thiểu: thiếu nó, người dùng không có cách nào yêu cầu truy cập hay xoá dữ liệu.
 */
export function hasPublishedContact(contact: OperatorContact = operatorContact): boolean {
  return typeof contact.email === 'string' && contact.email.length > 0;
}

/** Ngày cập nhật gần nhất của bộ tài liệu pháp lý — cập nhật thủ công khi sửa nội dung. */
export const LEGAL_LAST_UPDATED = '2026-08-16';
