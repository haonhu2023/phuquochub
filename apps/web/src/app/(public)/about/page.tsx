import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LegalSection } from '@/modules/legal/LegalPage';
import styles from '@/modules/legal/legal.module.css';

export const metadata: Metadata = {
  title: 'Giới thiệu · PhuQuocHub',
  description:
    'PhuQuocHub là gì, hiện đang làm được gì, và những gì còn đang xây dựng — nói thẳng về giai đoạn phát triển.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <LegalPage title="Giới thiệu" showUpdated={false}>
      <p className={styles.lead}>
        PhuQuocHub là nơi tra cứu địa điểm ở Phú Quốc: bãi biển, quán ăn, khách sạn, điểm tham quan,
        tour và chợ — trên một bản đồ, với thông tin có thể tìm kiếm và đánh giá từ người đã đến.
      </p>

      <LegalSection heading="Hiện tại làm được gì">
        <ul>
          <li>Duyệt và tìm kiếm địa điểm theo danh mục, khu vực và khoảng giá.</li>
          <li>Xem địa điểm trên bản đồ tương tác.</li>
          <li>Đọc và gửi đánh giá kèm ảnh, sau khi qua kiểm duyệt.</li>
          <li>Chủ cơ sở gửi yêu cầu nhận quyền quản lý và cập nhật thông tin địa điểm của mình.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Đang ở giai đoạn đầu">
        <p>
          Chúng tôi nói thẳng: PhuQuocHub mới đang hình thành. Kho địa điểm còn mỏng, phần lớn mục
          chưa có ảnh, và cộng đồng người dùng còn rất nhỏ. Một số phần trong lộ trình — như khu vực
          thảo luận cộng đồng — chưa được xây dựng.
        </p>
        <p>
          Điều đó có nghĩa là thông tin bạn thấy có thể chưa đầy đủ. Hãy kiểm chứng lại với cơ sở
          trước khi dựa vào đó để đi lại hoặc chi tiền.
        </p>
      </LegalSection>

      <LegalSection heading="Nguồn dữ liệu">
        <p>
          Dữ liệu bản đồ nền do{' '}
          <a href="https://www.openstreetmap.org/copyright" rel="noreferrer noopener" target="_blank">
            OpenStreetMap
          </a>{' '}
          và cộng đồng đóng góp cung cấp. Thông tin địa điểm đến từ biên tập nội bộ và đóng góp của
          người dùng, bao gồm cả chủ cơ sở đã được xác nhận.
        </p>
      </LegalSection>

      <LegalSection heading="Cách chúng tôi xử lý dữ liệu của bạn">
        <p>
          Không quảng cáo, không theo dõi hành vi, không cookie, không bán dữ liệu. Chi tiết đầy đủ
          nằm ở <Link href="/privacy">Chính sách bảo mật</Link>, và quy tắc sử dụng ở{' '}
          <Link href="/terms">Điều khoản sử dụng</Link>.
        </p>
      </LegalSection>

      <LegalSection heading="Góp ý và liên hệ">
        <p>
          Thấy thông tin sai, ảnh không phù hợp, hoặc muốn nhận quyền quản lý cơ sở của mình? Xem{' '}
          <Link href="/contact">trang Liên hệ</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
