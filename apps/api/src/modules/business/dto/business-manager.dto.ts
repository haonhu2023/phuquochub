import { IsUUID } from 'class-validator';

// POST /business/{id}/managers — ĐÚNG một trường đã đặc tả (business.md §5 UC-B6: "{user_id,
// role}" nhưng `role` luôn là `manager` ở endpoint này — không nhận từ body, tránh mở đường gán
// role khác qua endpoint này).
export class AssignBusinessManagerDto {
  @IsUUID('4')
  user_id!: string;
}
