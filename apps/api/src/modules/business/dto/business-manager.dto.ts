import { Transform } from 'class-transformer';
import { IsEmail, IsUUID, MaxLength } from 'class-validator';

// POST /business/{id}/managers — ĐÚNG một trường đã đặc tả (business.md §5 UC-B6: "{user_id,
// role}" nhưng `role` luôn là `manager` ở endpoint này — không nhận từ body, tránh mở đường gán
// role khác qua endpoint này).
export class AssignBusinessManagerDto {
  @IsUUID('4')
  user_id!: string;
}

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// GET /business/{id}/managers/lookup — tra `user_id` từ email CHÍNH XÁC (Manager Management,
// Phase 4 quyết định B: KHÔNG có API tìm-user-theo-email nào an toàn sẵn có — `GET /users/:id`
// (@Public) chỉ nhận id, không tìm theo email; `UsersRepository.findByEmail` đã tồn tại nhưng
// KHÔNG có route nào lộ ra ngoài). Endpoint này hẹp CÓ CHỦ Ý: đúng MỘT email, KHÔNG có tìm kiếm mờ/
// liệt kê, cùng `@AuthorizationContext` với assign/revoke (chỉ owner hiệu lực của ĐÚNG cơ sở `id`
// mới gọi được — PermissionsGuard chặn TRƯỚC khi service chạy). CHỈ trim (không lowercase) — khớp
// ĐÚNG cách `findByEmail`/đăng nhập so khớp email hôm nay (auth.service.ts: không chuẩn hoá case
// khi so khớp CSDL, chỉ chuẩn hoá cho audit).
export class LookupBusinessUserQueryDto {
  @IsEmail()
  @MaxLength(255)
  @Transform(trim)
  email!: string;
}
