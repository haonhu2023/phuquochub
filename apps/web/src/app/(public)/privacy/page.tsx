import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/modules/legal/LegalPage';
import { OperatorContactBlock } from '@/modules/legal/OperatorContact';
import styles from '@/modules/legal/legal.module.css';

export const metadata: Metadata = {
  title: 'Chính sách bảo mật · PhuQuocHub',
  description:
    'PhuQuocHub thu thập dữ liệu gì, vì sao, lưu ở đâu và trong bao lâu — mô tả đúng theo hành vi thực tế của hệ thống.',
  alternates: { canonical: '/privacy' },
};

// Nội dung dưới đây được viết từ kết quả rà soát mã nguồn thực tế (DTO đăng ký, thực thể đánh giá,
// luồng xác nhận cơ sở, đường ống tải ảnh, interceptor ghi log, cấu hình Caddy, script sao lưu).
// Mỗi tuyên bố đều ứng với một hành vi kiểm chứng được — không có mục nào mang tính khuôn mẫu.
export default function PrivacyPage() {
  return (
    <LegalPage title="Chính sách bảo mật">
      <p className={styles.lead}>
        PhuQuocHub là dịch vụ thông tin về Phú Quốc đang ở giai đoạn đầu. Trang này mô tả chính xác
        dữ liệu mà hệ thống đang thực sự xử lý — không nhiều hơn, không ít hơn.
      </p>

      <LegalSection heading="1. Dữ liệu chúng tôi thu thập">
        <p>
          Bạn có thể xem địa điểm, bản đồ và tìm kiếm mà <strong>không cần tài khoản</strong>. Dữ
          liệu cá nhân chỉ phát sinh khi bạn chủ động tạo tài khoản hoặc gửi nội dung.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Dữ liệu</th>
                <th scope="col">Phát sinh khi</th>
                <th scope="col">Mục đích</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Email, tên hiển thị, mật khẩu</td>
                <td>Đăng ký tài khoản</td>
                <td>Định danh, đăng nhập, liên hệ về tài khoản</td>
              </tr>
              <tr>
                <td>Điểm đánh giá (1–5) và nội dung nhận xét</td>
                <td>Gửi đánh giá cho một địa điểm</td>
                <td>Hiển thị công khai sau kiểm duyệt</td>
              </tr>
              <tr>
                <td>Ảnh bạn tải lên kèm chú thích, mô tả thay thế</td>
                <td>Tải ảnh cho địa điểm hoặc đánh giá</td>
                <td>Hiển thị công khai sau kiểm duyệt</td>
              </tr>
              <tr>
                <td>Bằng chứng xác nhận cơ sở kinh doanh</td>
                <td>Gửi yêu cầu xác nhận quyền quản lý địa điểm</td>
                <td>Để người kiểm duyệt xác minh quyền sở hữu</td>
              </tr>
              <tr>
                <td>Nhật ký truy cập máy chủ (địa chỉ IP, đường dẫn, thời điểm, trình duyệt)</td>
                <td>Mọi truy cập tới website</td>
                <td>Vận hành, chẩn đoán sự cố, chống lạm dụng</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className={styles.note}>
          Mật khẩu được lưu dưới dạng băm (hash), không lưu bản rõ. Nhật ký ứng dụng chỉ ghi mã
          tương quan, phương thức, đường dẫn, mã trạng thái và thời lượng xử lý —{' '}
          <strong>không ghi địa chỉ IP, không ghi nội dung yêu cầu</strong>; các trường nhạy cảm như
          token và mật khẩu bị loại bỏ trước khi ghi.
        </p>
      </LegalSection>

      <LegalSection heading="2. Cookie và theo dõi">
        <p>
          <strong>PhuQuocHub không đặt cookie nào</strong> và không dùng bất kỳ công cụ phân tích,
          quảng cáo hay theo dõi hành vi nào. Không có Google Analytics, không pixel, không mã bên
          thứ ba chạy trong trình duyệt của bạn.
        </p>
        <p>
          Phiên đăng nhập được giữ bằng <em>token</em> lưu trong bộ nhớ cục bộ (localStorage) của
          trình duyệt bạn, không phải cookie. Bạn có thể xoá bằng cách đăng xuất hoặc xoá dữ liệu
          website trong trình duyệt.
        </p>
        <p className={styles.note}>
          Vì không có cookie phi thiết yếu nào, trang này không hiển thị banner xin phép cookie.
        </p>
      </LegalSection>

      <LegalSection heading="3. Bên thứ ba nhận dữ liệu">
        <ul>
          <li>
            <strong>OpenStreetMap</strong> — khi bạn mở trang bản đồ, trình duyệt của bạn tải ảnh
            bản đồ trực tiếp từ máy chủ của OpenStreetMap. Họ nhận được địa chỉ IP của bạn và tên
            miền phuquochub.com (chỉ tên miền, không kèm đường dẫn cụ thể bạn đang xem, do chính
            sách referrer của chúng tôi).
          </li>
          <li>
            <strong>Nhà cung cấp máy chủ (Hostinger)</strong> — máy chủ chạy dịch vụ và cơ sở dữ
            liệu.
          </li>
          <li>
            <strong>Cloudflare R2</strong> — nơi lưu bản sao lưu dự phòng ngoài máy chủ chính.
          </li>
        </ul>
        <p>
          Chúng tôi <strong>không bán</strong> dữ liệu cá nhân và không chia sẻ cho mục đích quảng
          cáo.
        </p>
      </LegalSection>

      <LegalSection heading="4. Ảnh và đường dẫn có chữ ký">
        <p>
          Ảnh được lưu trong kho lưu trữ riêng tư, không cho phép truy cập ẩn danh. Khi hiển thị,
          hệ thống cấp một đường dẫn có chữ ký với thời hạn ngắn (khoảng 5 phút). Ảnh đã được duyệt
          và đăng công khai thì bất kỳ ai có đường dẫn trong thời hạn đó đều xem được — vì vậy đừng
          tải lên ảnh chứa thông tin bạn không muốn công khai.
        </p>
      </LegalSection>

      <LegalSection heading="5. Thời gian lưu trữ">
        <ul>
          <li>Dữ liệu tài khoản và nội dung bạn gửi: lưu trong suốt thời gian tài khoản còn hoạt động.</li>
          <li>
            Bản sao lưu cơ sở dữ liệu: theo chính sách luân phiên 7 bản ngày, 4 bản tuần, 6 bản
            tháng — nghĩa là dữ liệu đã xoá vẫn có thể tồn tại trong bản sao lưu tới khoảng 6 tháng
            trước khi bị ghi đè.
          </li>
          <li>Nhật ký truy cập máy chủ: lưu theo tệp luân phiên, tối đa 5 tệp mỗi loại.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="6. Quyền của bạn">
        <p>
          Bạn có quyền yêu cầu xem, sửa hoặc xoá dữ liệu cá nhân của mình, và yêu cầu ngừng xử lý.
        </p>
        <p>
          Hiện tại <strong>chưa có chức năng tự xoá tài khoản trong giao diện</strong>. Mọi yêu cầu
          phải gửi qua kênh liên hệ chính thức và sẽ được xử lý thủ công.
        </p>
        <OperatorContactBlock purpose="thực hiện các quyền nêu trên" />
      </LegalSection>

      <LegalSection heading="7. An toàn dữ liệu">
        <p>
          Toàn bộ truy cập dùng HTTPS. Mật khẩu được băm. Cơ sở dữ liệu và kho ảnh không mở ra
          Internet mà chỉ truy cập được từ nội bộ máy chủ. Dù vậy, không hệ thống nào an toàn tuyệt
          đối — chúng tôi không cam kết mức bảo mật không thể bị phá vỡ.
        </p>
      </LegalSection>

      <LegalSection heading="8. Trẻ em">
        <p>
          Dịch vụ không hướng tới trẻ em. Nếu bạn cho rằng một trẻ em đã cung cấp dữ liệu cá nhân
          cho chúng tôi, hãy liên hệ để chúng tôi xoá.
        </p>
      </LegalSection>

      <LegalSection heading="9. Thay đổi chính sách">
        <p>
          Khi nội dung thay đổi, ngày cập nhật ở đầu trang sẽ thay đổi theo. Với thay đổi lớn ảnh
          hưởng tới quyền của bạn, chúng tôi sẽ thông báo trước khi áp dụng.
        </p>
      </LegalSection>

      <LegalSection heading="10. Phạm vi và giới hạn của tài liệu này">
        <p className={styles.note}>
          Tài liệu này mô tả trung thực cách hệ thống đang vận hành tại ngày cập nhật nêu trên.{' '}
          <strong>
            Nó chưa được luật sư rà soát và không phải là cam kết tuân thủ đầy đủ pháp luật của bất
            kỳ quốc gia nào.
          </strong>{' '}
          Trước khi PhuQuocHub mở công khai, nội dung này cần được rà soát pháp lý — đặc biệt là
          phần nghĩa vụ theo quy định bảo vệ dữ liệu cá nhân áp dụng cho nơi đặt máy chủ và nơi cư
          trú của người dùng.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
