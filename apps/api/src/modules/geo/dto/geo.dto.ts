import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

// Trần bán kính khớp GeoService.MAX_RADIUS_M (geo.service.ts) — chặn ngay ở DTO thay vì chỉ
// clamp thầm lặng ở service, để caller ẩn danh không yêu cầu bán kính không giới hạn.
const MAX_RADIUS_M = 50000;

// OD-F-1 (F1-C): các query địa lý KHÔNG còn từ chối theo hộp PROVISIONAL. Đây là đường ĐỌC:
// truy vấn ngoài hộp vô hại (chỉ trả về rỗng) và không tạo ra dữ liệu sai, nên cố tình KHÔNG
// phát tín hiệu ở đây — ghi log mọi truy vấn công khai ngoài hộp sẽ khuếch đại log do caller
// ẩn danh điều khiển. Tín hiệu chỉ đặt ở đường GHI (PlacesService), nơi dữ liệu thực sự sinh ra.
// Guard toàn cầu @Min/@Max giữ nguyên: |lat|>90, |lng|>180, NaN vẫn bị từ chối.

export class NearbyQueryDto {
  @Type(() => Number) @IsNumber() @Min(-90) @Max(90)
  lat!: number;

  @Type(() => Number) @IsNumber() @Min(-180) @Max(180)
  lng!: number;

  // mét; mặc định ở service (2000). Trần biên tại DTO = MAX_RADIUS_M.
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_RADIUS_M)
  radius?: number;

  @IsOptional() @IsString()
  category?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number;
}

export class BboxQueryDto {
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180)
  minLng!: number;

  @Type(() => Number) @IsNumber() @Min(-90) @Max(90)
  minLat!: number;

  @Type(() => Number) @IsNumber() @Min(-180) @Max(180)
  maxLng!: number;

  @Type(() => Number) @IsNumber() @Min(-90) @Max(90)
  maxLat!: number;

  @IsOptional() @Type(() => Number) @IsInt()
  zoom?: number;

  // Search Filters (category/ward) — cùng convention ListPlacesQueryDto/SearchQueryDto: category
  // là category_id (uuid) nhưng chỉ @IsString() để khớp kiểu lỏng đã dùng ở hai endpoint kia.
  @IsOptional() @IsString()
  category?: string;

  @IsOptional() @IsString()
  ward?: string;
}

export class GeocodeQueryDto {
  @IsString()
  q!: string;
}
