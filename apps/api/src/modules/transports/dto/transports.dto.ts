import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export const TRANSPORT_SORT_VALUES = ['rating_desc', 'name_asc', 'newest'] as const;
export type TransportSort = (typeof TRANSPORT_SORT_VALUES)[number];

export const PRICING_MODEL_VALUES = [
  'fixed',
  'starting_from',
  'per_km',
  'per_hour',
  'per_person',
  'per_vehicle',
  'contact',
] as const;
export type PricingModel = (typeof PRICING_MODEL_VALUES)[number];

// Query string luôn là chuỗi ('true'/'false'), khác body JSON (nơi @IsBoolean() một mình đã đủ
// vì boolean thật đến sẵn) — @IsBoolean() một mình sẽ từ chối MỌI query string. Transform chỉ
// đổi đúng hai chuỗi hợp lệ; giá trị lạ (vd 'yes', '1') giữ nguyên để @IsBoolean() từ chối đúng
// (400), không âm thầm coerce sai (Boolean('false') === true là lỗi JS kinh điển, tránh dùng).
function toStrictBoolean(value: unknown): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

// Query của `GET /api/transports` — công khai.
//
// Transport Browse Filters (2026-07-30): bộ lọc đầy đủ đã THIẾT KẾ ở
// docs/data/modules/transport.md §8 nay đã triển khai, khớp đúng bảng tham số ở đó. Từ chối 400
// (không âm thầm bỏ qua) các tham số đã liệt kê là hoãn/không hỗ trợ: `category` (đã là chính
// endpoint này), `district` (không có cột), `capacity_min`/`capacity_max` (chưa có dữ liệu thật),
// `provider` (Business ownership chưa migrate) — không khai ở đây ⇒ whitelist+forbidNonWhitelisted
// (main.ts) tự từ chối, không cần logic riêng.
export class ListTransportsQueryDto {
  // Mã trong transport_types.code (vd 'taxi', 'ferry') — so khớp chính xác qua JOIN, không phải
  // UUID của transport_type_id (client không cần biết id nội bộ).
  @IsOptional() @IsString()
  transport_type?: string;

  // Text tự do, cùng quy ước ward mọi vertical khác — khớp qua EXISTS trên
  // transport_service_areas (1:N, khác cột places.ward đơn của Hotel/Restaurant/Tour).
  @IsOptional() @IsString()
  ward?: string;

  @IsOptional() @IsIn(PRICING_MODEL_VALUES)
  pricing_model?: PricingModel;

  // Tri-state: false KHÔNG khớp NULL (chưa xác nhận), chỉ khớp giá trị TƯỜNG MINH — xem
  // transport.md §8 và TransportsRepository.
  @IsOptional() @Transform(({ value }) => toStrictBoolean(value)) @IsBoolean()
  booking_required?: boolean;

  @IsOptional() @Transform(({ value }) => toStrictBoolean(value)) @IsBoolean()
  airport_transfer?: boolean;

  @IsOptional() @IsIn(TRANSPORT_SORT_VALUES)
  sort?: TransportSort;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number;
}
