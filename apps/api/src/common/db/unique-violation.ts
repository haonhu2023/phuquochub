/**
 * Nhận diện vi phạm UNIQUE của Postgres (SQLSTATE 23505) trên MỘT constraint cụ thể.
 *
 * Trích ra từ `BusinessClaimsService` (nơi nó ra đời cho `uq_member_owner`) để dùng chung — mọi
 * service có một partial-unique index làm "chốt chặn cuối cùng" cho một bất biến nghiệp vụ đều cần
 * đúng logic này: bắt ĐÚNG vi phạm đã lường trước, KHÔNG bắt mọi lỗi DB (một lỗi khác phải nổi lên
 * nguyên trạng, không bị âm thầm biến thành 409).
 *
 * Truyền tên constraint tường minh; bỏ trống tất cả nghĩa là "bất kỳ 23505 nào" (không khuyến khích
 * — mất đúng tính chọn lọc vừa nói ở trên).
 */
export function isUniqueViolation(err: unknown, ...constraintNames: string[]): boolean {
  const e = err as {
    code?: string;
    constraint?: string;
    driverError?: { code?: string; constraint?: string };
  };
  const code = e.code ?? e.driverError?.code;
  if (code !== '23505') {
    return false;
  }
  if (constraintNames.length === 0) {
    return true;
  }
  const constraint = e.constraint ?? e.driverError?.constraint;
  return constraint !== undefined && constraintNames.includes(constraint);
}
