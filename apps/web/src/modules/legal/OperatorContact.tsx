import { hasPublishedContact, operatorContact } from '@/lib/site-identity';
import styles from './legal.module.css';

/**
 * Hiển thị kênh liên hệ chính thức, hoặc — khi Owner chưa cung cấp — một thông báo TRUNG THỰC về
 * hiện trạng.
 *
 * Đây có chủ đích KHÔNG phải placeholder: không có địa chỉ giả, không có "TODO". Khi chưa có dữ
 * liệu, trang nói đúng điều đang đúng ("chưa công bố") thay vì khẳng định một kênh liên hệ không
 * tồn tại — một chính sách bảo mật chỉ tới hộp thư không có thật còn tệ hơn là thừa nhận nó chưa
 * sẵn sàng.
 */
export function OperatorContactBlock({ purpose }: { purpose: string }) {
  if (!hasPublishedContact()) {
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
      {operatorContact.legalName ? (
        <li>
          <span className={styles.contactLabel}>Bên vận hành:</span>
          {operatorContact.legalName}
        </li>
      ) : null}
      <li>
        <span className={styles.contactLabel}>Email:</span>
        <a href={`mailto:${operatorContact.email}`}>{operatorContact.email}</a>
      </li>
      {operatorContact.address ? (
        <li>
          <span className={styles.contactLabel}>Địa chỉ:</span>
          {operatorContact.address}
        </li>
      ) : null}
      {operatorContact.responseTime ? (
        <li>
          <span className={styles.contactLabel}>Thời gian phản hồi:</span>
          {operatorContact.responseTime}
        </li>
      ) : null}
    </ul>
  );
}
