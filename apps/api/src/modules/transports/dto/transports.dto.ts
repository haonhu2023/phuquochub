import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const TRANSPORT_SORT_VALUES = ['rating_desc', 'name_asc', 'newest'] as const;
export type TransportSort = (typeof TRANSPORT_SORT_VALUES)[number];

// Query của `GET /api/transports` — công khai.
//
// CỐ Ý TỐI GIẢN (chỉ sort/page/limit): đây là nhiệm vụ nền tảng (ADR-017), KHÔNG phải trang
// Browse công khai. Bộ lọc đầy đủ (`transport_type`/`ward`/`pricing_model`/`booking_required`/
// `airport_transfer`) đã được THIẾT KẾ ở docs/data/modules/transport.md §8 nhưng triển khai
// controller/repository cho chúng thuộc phạm vi nhiệm vụ Transport Browse kế tiếp — thêm bộ lọc
// sau này chỉ là bổ sung tham số (additive), không phải thay đổi phá vỡ tương thích.
export class ListTransportsQueryDto {
  @IsOptional() @IsIn(TRANSPORT_SORT_VALUES)
  sort?: TransportSort;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number;
}
