import { Type } from 'class-transformer';
import { IsEnum, IsISO8601, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { AuditResult } from '../../../core/audit/audit.enums';

// Trang tra cứu riêng (2026-10-22, vá gap "audit log chỉ xem được 20 dòng gần nhất, không lọc/tìm/
// phân trang" — phát hiện khi rà soát vận hành toàn site, mục 3). `event` khớp MỘT PHẦN (ILIKE) —
// vd "job_listing" tìm mọi `job_listing.*`, không phải so khớp tuyệt đối — đúng cách owner thật sự
// cần tìm ("mọi hành động trên module này") hơn là phải biết chính xác tên event.
export class ListAuditLogQueryDto {
  @IsOptional() @IsString() @MaxLength(40)
  entity_type?: string;

  @IsOptional() @IsUUID()
  entity_id?: string;

  @IsOptional() @IsUUID()
  actor_id?: string;

  @IsOptional() @IsString() @MaxLength(60)
  event?: string;

  @IsOptional() @IsEnum(AuditResult)
  result?: AuditResult;

  @IsOptional() @IsISO8601()
  from?: string;

  @IsOptional() @IsISO8601()
  to?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
}
