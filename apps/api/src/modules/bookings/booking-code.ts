import { randomBytes } from 'crypto';

// Bảng chữ Crockford-rút gọn: bỏ 0/O/1/I/L (dễ đọc nhầm qua điện thoại/giấy in) — booking_code là
// mã khách tự đọc/gõ lại để tra cứu, không phải chỉ hiển thị trong URL.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 8;
// ~log2(31^8) ≈ 39.6 bit entropy — đủ chống đoán ngẫu nhiên (khoá lại sau bằng auth+ownership
// check ở BookingsService.getByCodeForUser, mã không phải là toàn bộ hàng rào bảo mật).
const CODE_PATTERN = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);

/** Sinh mã booking công khai không đoán được (8 ký tự ngẫu nhiên, ~40 bit entropy). */
export function generateBookingCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (const b of bytes) {
    code += ALPHABET[b % ALPHABET.length];
  }
  return code;
}

/** Xác thực định dạng trước khi truy vấn DB — chặn sớm input rác/quá dài, không phải kiểm tra tồn tại. */
export function isValidBookingCodeFormat(code: string): boolean {
  return CODE_PATTERN.test(code);
}
