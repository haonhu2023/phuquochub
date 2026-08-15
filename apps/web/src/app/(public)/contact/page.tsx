import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/modules/legal/LegalPage';
import { OperatorContactBlock } from '@/modules/legal/OperatorContact';
import styles from '@/modules/legal/legal.module.css';

export const metadata: Metadata = {
  title: 'Liên hệ · PhuQuocHub',
  description: 'Cách liên hệ với PhuQuocHub: báo thông tin sai, khiếu nại nội dung, yêu cầu về dữ liệu cá nhân.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <LegalPage title="Liên hệ" showUpdated={false}>
      <p className={styles.lead}>
        Bạn có thể liên hệ để báo thông tin sai, khiếu nại một nội dung, xin nhận quyền quản lý cơ
        sở, hoặc thực hiện quyền với dữ liệu cá nhân của mình.
      </p>

      <LegalSection heading="Kênh liên hệ">
        <OperatorContactBlock purpose="gửi các yêu cầu nêu trên" />
      </LegalSection>

      <LegalSection heading="Một số việc bạn tự làm được ngay">
        <ul>
          <li>
            <strong>Chủ cơ sở muốn quản lý địa điểm:</strong> đăng nhập rồi gửi yêu cầu xác nhận kèm
            bằng chứng ngay trong ứng dụng — không cần liên hệ trước.
          </li>
          <li>
            <strong>Nội dung vi phạm:</strong> đánh giá và ảnh đều đi qua kiểm duyệt trước khi hiển
            thị công khai; nội dung đã đăng vẫn có thể bị gỡ khi được báo cáo.
          </li>
          <li>
            <strong>Xoá phiên đăng nhập:</strong> đăng xuất hoặc xoá dữ liệu website trong trình
            duyệt.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Yêu cầu về dữ liệu cá nhân">
        <p>
          Yêu cầu xem, sửa hoặc xoá dữ liệu được xử lý thủ công vì hiện chưa có chức năng tự phục vụ
          trong giao diện. Xem phạm vi dữ liệu và thời gian lưu trữ tại{' '}
          <Link href="/privacy">Chính sách bảo mật</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
