import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

// Trần bán kính khớp GeoService.MAX_RADIUS_M (geo.service.ts) — chặn ngay ở DTO thay vì chỉ
// clamp thầm lặng ở service, để caller ẩn danh không yêu cầu bán kính không giới hạn.
const MAX_RADIUS_M = 50000;

// Map Audit (2026-08-10): bbox có 4 cạnh ĐỘC LẬP (mỗi cạnh chỉ tự kiểm tra |lat|<=90/|lng|<=180),
// nên trước đây KHÔNG có gì chặn một bbox "lộn ngược" (vd minLng > maxLng) — ST_MakeEnvelope không
// đảm bảo tự sửa thứ tự trên mọi phiên bản PostGIS, và dù có, một bbox lộn ngược vẫn là request dị
// dạng về mặt hợp đồng API. Decorator generic (không riêng bbox) để dùng lại được nếu cần.
function IsGreaterThanOrEqualTo(property: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isGreaterThanOrEqualTo',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const [relatedProperty] = args.constraints as [string];
          const relatedValue = (args.object as Record<string, unknown>)[relatedProperty];
          return typeof value === 'number' && typeof relatedValue === 'number' && value >= relatedValue;
        },
        defaultMessage(args: ValidationArguments): string {
          const [relatedProperty] = args.constraints as [string];
          return `${args.property} phải >= ${relatedProperty} (bbox không hợp lệ)`;
        },
      },
    });
  };
}

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

  // >= minLng bắt buộc: một bbox lộn ngược là dị dạng, không phải "vùng ngoài Phú Quốc" (OD-F-1
  // chỉ nói về VỊ TRÍ của bbox, không nói về TÍNH HỢP LỆ nội tại của 4 cạnh).
  @Type(() => Number) @IsNumber() @Min(-180) @Max(180) @IsGreaterThanOrEqualTo('minLng')
  maxLng!: number;

  @Type(() => Number) @IsNumber() @Min(-90) @Max(90) @IsGreaterThanOrEqualTo('minLat')
  maxLat!: number;

  // Khớp trần GeoService.bbox() clamp (Math.min(Math.max(zoom,1),20)) — chặn ngay ở DTO thay vì
  // chỉ clamp thầm lặng, cùng convention radius ở trên.
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20)
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
