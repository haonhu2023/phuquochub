import { randomBytes } from 'crypto';

// Bảng chữ Crockford-rút gọn: bỏ 0/O/1/I/L (dễ đọc nhầm qua điện thoại/giấy in) — booking_code là
// mã khách tự đọc/gõ lại để tra cứu, không phải chỉ hiển thị trong URL.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Sinh mã booking công khai không đoán được (8 ký tự ngẫu nhiên, ~40 bit entropy). */
export function generateBookingCode(): string {
  const bytes = randomBytes(8);
  let code = '';
  for (const b of bytes) {
    code += ALPHABET[b % ALPHABET.length];
  }
  return code;
}
