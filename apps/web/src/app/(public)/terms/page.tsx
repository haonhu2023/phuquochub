import type { Metadata } from 'next';
import { operatorContact } from '@/lib/site-identity';
import { LegalPage, LegalSection } from '@/modules/legal/LegalPage';
import { OperatorContactBlock } from '@/modules/legal/OperatorContact';
import styles from '@/modules/legal/legal.module.css';

export const metadata: Metadata = {
  title: 'Điều khoản sử dụng · PhuQuocHub',
  description:
    'Quy tắc sử dụng PhuQuocHub: tài khoản, nội dung bạn đăng, kiểm duyệt, xác nhận cơ sở kinh doanh và giới hạn trách nhiệm.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <LegalPage title="Điều khoản sử dụng">
      <p className={styles.lead}>
        Khi tạo tài khoản hoặc gửi nội dung lên PhuQuocHub, bạn đồng ý với các điều khoản dưới đây.
        Nếu không đồng ý, bạn vẫn có thể duyệt nội dung công khai mà không cần tài khoản.
      </p>

      <LegalSection heading="1. Dịch vụ là gì">
        <p>
          PhuQuocHub là danh bạ cộng đồng về địa điểm ở Phú Quốc: bản đồ, tìm kiếm, thông tin địa
          điểm, đánh giá của người dùng và kênh để chủ cơ sở nhận quyền quản lý địa điểm của mình.
        </p>
        <p>
          Dịch vụ đang ở <strong>giai đoạn đầu</strong>. Tính năng có thể thay đổi hoặc tạm ngừng,
          và dữ liệu hiển thị có thể chưa đầy đủ.
        </p>
      </LegalSection>

      <LegalSection heading="2. Tài khoản">
        <ul>
          <li>Cung cấp email có thật và tên hiển thị phù hợp; mật khẩu tối thiểu 8 ký tự.</li>
          <li>Bạn chịu trách nhiệm về mọi hoạt động diễn ra dưới tài khoản của mình.</li>
          <li>Không mạo danh người khác, tổ chức khác hoặc chính PhuQuocHub.</li>
          <li>
            Chúng tôi có thể vô hiệu hoá tài khoản vi phạm các điều khoản này hoặc gây hại cho người
            dùng khác.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="3. Nội dung bạn đăng">
        <p>
          Bạn giữ quyền đối với nội dung mình đăng (đánh giá, ảnh, thông tin địa điểm). Khi đăng,
          bạn cấp cho PhuQuocHub quyền không độc quyền, miễn phí để lưu trữ, hiển thị và phân phối
          nội dung đó trong phạm vi vận hành dịch vụ.
        </p>
        <h3>Bạn cam kết</h3>
        <ul>
          <li>Bạn sở hữu ảnh mình tải lên, hoặc có quyền hợp pháp để đăng chúng.</li>
          <li>Đánh giá phản ánh trải nghiệm thật của chính bạn.</li>
          <li>
            Không đăng nội dung trái pháp luật, xúc phạm, quấy rối, xâm phạm đời tư hay vi phạm bản
            quyền của người khác.
          </li>
          <li>
            Không đăng đánh giá giả, không thuê/đổi chác đánh giá, không dàn xếp nhiều tài khoản để
            nâng hoặc dìm một địa điểm.
          </li>
          <li>Chỉ tải lên ảnh định dạng JPEG, PNG hoặc WebP trong giới hạn dung lượng cho phép.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="4. Kiểm duyệt">
        <p>
          Đánh giá và ảnh được đưa vào hàng chờ kiểm duyệt trước khi hiển thị công khai. Chúng tôi
          có thể từ chối, ẩn hoặc gỡ nội dung vi phạm điều khoản, kèm theo lý do phân loại. Quyết
          định kiểm duyệt có thể được xem lại nếu bạn cho rằng có sai sót.
        </p>
      </LegalSection>

      <LegalSection heading="5. Xác nhận quyền quản lý cơ sở">
        <p>
          Chủ cơ sở có thể gửi yêu cầu nhận quyền quản lý một địa điểm kèm bằng chứng. Bạn chỉ được
          gửi yêu cầu nếu bạn thực sự là chủ sở hữu hoặc người được uỷ quyền hợp lệ. Yêu cầu gian
          dối sẽ bị từ chối và có thể dẫn tới khoá tài khoản.
        </p>
        <p>
          Được duyệt nghĩa là bạn có quyền cập nhật thông tin địa điểm — <strong>không</strong> có
          nghĩa là bạn có quyền xoá hay sửa đánh giá trung thực của người khác.
        </p>
      </LegalSection>

      <LegalSection heading="6. Độ chính xác của thông tin">
        <p>
          Thông tin địa điểm (giờ mở cửa, giá, mô tả, vị trí) đến từ nhiều nguồn, gồm cả đóng góp
          của cộng đồng, và <strong>có thể sai hoặc lỗi thời</strong>. Hãy kiểm chứng trực tiếp với
          cơ sở trước khi đi lại hay chi tiền. Dữ liệu bản đồ do OpenStreetMap cung cấp theo giấy
          phép riêng của họ.
        </p>
      </LegalSection>

      <LegalSection heading="7. Giới hạn trách nhiệm">
        <p>
          Dịch vụ được cung cấp &ldquo;nguyên trạng&rdquo;, không kèm bảo đảm về tính sẵn sàng liên
          tục, không lỗi hay phù hợp cho một mục đích cụ thể. Trong phạm vi pháp luật cho phép,
          chúng tôi không chịu trách nhiệm cho thiệt hại gián tiếp phát sinh từ việc sử dụng dịch
          vụ hoặc từ việc tin vào thông tin hiển thị trên đó.
        </p>
        <p>
          Điều khoản này không nhằm loại trừ trách nhiệm mà pháp luật không cho phép loại trừ.
        </p>
      </LegalSection>

      <LegalSection heading="8. Ngừng sử dụng">
        <p>
          Bạn có thể ngừng dùng dịch vụ bất cứ lúc nào. Hiện chưa có chức năng tự xoá tài khoản
          trong giao diện — yêu cầu xoá cần gửi qua kênh liên hệ chính thức.
        </p>
      </LegalSection>

      <LegalSection heading="9. Thay đổi điều khoản">
        <p>
          Chúng tôi có thể cập nhật điều khoản khi dịch vụ thay đổi. Ngày cập nhật ở đầu trang phản
          ánh phiên bản hiện hành; tiếp tục sử dụng sau khi cập nhật đồng nghĩa với việc bạn chấp
          nhận nội dung mới.
        </p>
      </LegalSection>

      <LegalSection heading="10. Luật áp dụng và liên hệ">
        {operatorContact.governingLaw ? (
          <p>Điều khoản này được điều chỉnh bởi pháp luật {operatorContact.governingLaw}.</p>
        ) : (
          <p className={styles.note}>
            Hệ thống pháp luật điều chỉnh điều khoản này sẽ được công bố cùng thông tin bên vận hành
            trước khi dịch vụ mở công khai.
          </p>
        )}
        <OperatorContactBlock purpose="gửi khiếu nại hoặc câu hỏi về điều khoản" />
      </LegalSection>

      <LegalSection heading="11. Giới hạn của tài liệu này">
        <p className={styles.note}>
          Tài liệu này được soạn theo đúng cách dịch vụ đang vận hành, nhưng{' '}
          <strong>chưa qua rà soát của luật sư</strong> và không phải là tư vấn pháp lý. Cần rà
          soát pháp lý trước khi mở công khai.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
