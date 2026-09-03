import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/modules/legal/LegalPage';
import { OperatorContactBlock } from '@/modules/legal/OperatorContact';
import { localizedHref, type Locale } from '@/lib/locale';
import styles from '@/modules/legal/legal.module.css';

interface Props {
  params: Promise<{ locale: string }>;
}

// PR A: `generateMetadata` vì canonical cần `params.locale`.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  return {
    title: 'Liên hệ · PhuQuocHub',
    description: 'Cách liên hệ với PhuQuocHub: báo thông tin sai, khiếu nại nội dung, yêu cầu về dữ liệu cá nhân.',
    alternates: { canonical: localizedHref(locale, '/contact') },
  };
}

export default async function ContactPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
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
          trong giao diện. Xem phạm vi dữ liệu, thời gian lưu trữ và đầy đủ các quyền của bạn tại{' '}
          <Link href={localizedHref(locale, '/privacy')}>Chính sách bảo mật</Link>.
        </p>
        <p>
          Để chúng tôi xác minh được yêu cầu đến từ đúng chủ tài khoản, hãy gửi{' '}
          <strong>từ chính địa chỉ email bạn đã dùng để đăng ký</strong> và nêu rõ bạn muốn làm gì
          (xem, sửa, xoá, hoặc rút lại sự đồng ý). Chúng tôi sẽ chỉ trả lời qua địa chỉ email đó.
        </p>
        <p className={styles.note}>
          Xin đừng gửi kèm giấy tờ tuỳ thân, ảnh chụp căn cước hay thông tin nhạy cảm khác — chúng
          tôi không yêu cầu và không muốn lưu giữ những dữ liệu đó.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
