import { hasPublishedContact, operatorContact, type OperatorContact } from '@/lib/site-identity';
import styles from './legal.module.css';

/**
 * Hiển thị kênh liên hệ chính thức, hoặc — khi chưa có dữ liệu — một thông báo TRUNG THỰC về hiện
 * trạng.
 *
 * Nhánh "chưa công bố" có chủ đích KHÔNG phải placeholder: không có địa chỉ giả, không có "TODO".
 * Khi thiếu dữ liệu, trang nói đúng điều đang đúng thay vì khẳng định một kênh liên hệ không tồn
 * tại — một chính sách bảo mật trỏ tới hộp thư không có thật còn tệ hơn là thừa nhận nó chưa sẵn
 * sàng. Owner đã điền `site-identity.ts` nên nhánh đó hiện không chạy ở production; nó được giữ
 * lại vì nó là hành vi đúng nếu cấu hình bị xoá, và `contact` cho phép test ghim cả hai nhánh.
 */
export function OperatorContactBlock({
  purpose,
  contact = operatorContact,
}: {
  purpose: string;
  contact?: OperatorContact;
}) {
  if (!hasPublishedContact(contact)) {
    return (
      <div className={styles.pending} role="note">
        <p>
          <strong>Kênh liên hệ chính thức chưa được công bố.</strong> PhuQuocHub đang ở giai đoạn
          đầu và chưa mở công khai. Địa chỉ liên hệ để {purpose} sẽ được đăng tại đây trước khi dịch
          vụ mở rộng cho công chúng.
        </p>
        <p className={styles.note}>
          Nếu bạn đang dùng bản dùng thử nội bộ và cần liên hệ gấp, hãy dùng kênh mà người mời bạn
          tham gia đã cung cấp.
        </p>
      </div>
    );
  }

  return (
    <ul className={styles.contactList}>
      {contact.legalName ? (
        <li>
          <span className={styles.contactLabel}>Bên vận hành:</span>
          {contact.legalName}
        </li>
      ) : null}
      <li>
        <span className={styles.contactLabel}>Email:</span>
        <a href={`mailto:${contact.email}`}>{contact.email}</a>
      </li>
      {contact.address ? (
        <li>
          <span className={styles.contactLabel}>Địa chỉ:</span>
          {contact.address}
        </li>
      ) : null}
      {contact.responseTime ? (
        <li>
          <span className={styles.contactLabel}>Thời gian phản hồi:</span>
          {contact.responseTime}
        </li>
      ) : null}
    </ul>
  );
}
