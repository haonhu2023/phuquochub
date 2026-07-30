import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MaxLength,
  ValidateNested,
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';
import {
  BOOKABLE_ENTITY_TYPES,
  BookableEntityType,
  BookingFulfillmentStatus,
  BookingPaymentStatus,
  BookingStatus,
} from '../booking.enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Cross-field: giá trị (ISO 8601) phải SAU giá trị của `property` trên cùng object. Bỏ qua nếu
 * một trong hai vắng mặt — validator từng trường (@IsOptional/@IsISO8601) đã tự xử lý trường hợp đó. */
function IsAfter(property: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAfter',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [relatedProperty] = args.constraints as [string];
          const relatedValue = (args.object as Record<string, unknown>)[relatedProperty];
          if (value == null || relatedValue == null) return true;
          const a = new Date(value as string);
          const b = new Date(relatedValue as string);
          if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return true; // @IsISO8601 báo lỗi format riêng
          return a.getTime() > b.getTime();
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} phải sau ${args.constraints[0]}`;
        },
      },
    });
  };
}

export class CreateBookingItemDto {
  @IsString() @MaxLength(200)
  @Transform(trim)
  label!: string;

  @IsInt() @Min(1) @Max(50)
  quantity!: number;

  // TRUST BOUNDARY: giá client gửi lên (chưa có pricing engine xác nhận từ nhà cung cấp trong
  // slice này) — đây là số tiền YÊU CẦU/BÁO GIÁ tại thời điểm đặt, KHÔNG phải giá cuối cùng đã
  // xác nhận. bookingStatus khởi tạo luôn 'pending' phản ánh đúng việc chưa có xác nhận nào.
  // Không tự ý quảng bá subtotal/grand_total (tính từ giá trị này) như final price ở tầng gọi.
  @IsNumber() @Min(0)
  unit_price!: number;
}

// Foundation: một booking = một satellite Place (entity_type/entity_id/place_id), kèm ≥1 line
// item. Không payment thật, không mã giảm giá (discount/fees luôn 0 ở slice này). Client KHÔNG
// thể tự đặt booking_status/payment_status/fulfillment_status — các trường này không tồn tại
// trên DTO này và ValidationPipe toàn cục dùng forbidNonWhitelisted:true (main.ts) nên bất kỳ
// trường lạ nào trong body (kể cả cố tình gửi booking_status) đều bị từ chối trước khi tới service.
export class CreateBookingRequestDto {
  @IsIn(BOOKABLE_ENTITY_TYPES)
  entity_type!: BookableEntityType;

  @IsUUID('4')
  entity_id!: string;

  @IsUUID('4')
  place_id!: string;

  @IsOptional() @IsString() @MaxLength(30)
  @Transform(trim)
  booking_type?: string;

  @IsOptional() @IsISO8601()
  service_start_at?: string;

  @IsOptional() @IsISO8601()
  @IsAfter('service_start_at')
  service_end_at?: string;

  @IsInt() @Min(1) @Max(200)
  party_size!: number;

  @IsArray() @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateBookingItemDto)
  items!: CreateBookingItemDto[];

  @IsOptional() @IsString() @MaxLength(2000)
  @Transform(trim)
  guest_note?: string;

  // Availability & Inventory Foundation — HOÀN TOÀN optional, backward-compatible: bỏ trống thì
  // hành vi giống hệt trước (không có hold nào được tạo, y hệt Booking Request Foundation gốc).
  // "party_size" (đã có sẵn, không thêm trường quantity mới) là số lượng giữ chỗ trên slot.
  @IsOptional() @IsUUID('4')
  availability_slot_id?: string;

  // "Configurable expiration time" (yêu cầu mục B) — bỏ trống dùng mặc định hệ thống
  // (BookingsService.DEFAULT_HOLD_TTL_MINUTES). Chỉ có ý nghĩa khi availability_slot_id được gửi.
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1440)
  hold_ttl_minutes?: number;
}

// Phase 2 — Booking Application Layer: admin/staff query, KHÔNG public (Booking.List). Chỉ 2
// trường sort được phép — cả hai đã có index sẵn (idx_bookings_service_start,
// InitBooking1720002400000) hoặc là PK-order-adjacent (created_at, đã index qua idx_bookings_
// customer) — không cho sort theo cột tuỳ ý để tránh full-scan không kiểm soát.
export const BOOKING_SORT_FIELDS = ['created_at', 'service_start_at', 'grand_total'] as const;
export type BookingSortField = (typeof BOOKING_SORT_FIELDS)[number];

// "date range" (yêu cầu Phase 2, mục A) lọc theo service_start_at — KHÔNG phải created_at.
// Bằng chứng: InitBooking1720002400000 đã tạo sẵn idx_bookings_service_start với chú thích
// "Truy vấn quản trị/tương lai lọc theo trạng thái... và theo mốc dịch vụ sắp tới ('booking
// trong 7 ngày tới')" — nghĩa là "date range" ở đây được thiết kế cho ngày DỊCH VỤ (khi nào diễn
// ra), không phải ngày TẠO booking. Lọc theo created_at có thể bổ sung sau nếu có nhu cầu thật,
// không phát minh trước ở đây.
export class ListBookingsQueryDto {
  @IsOptional() @IsEnum(BookingStatus)
  booking_status?: BookingStatus;

  @IsOptional() @IsEnum(BookingPaymentStatus)
  payment_status?: BookingPaymentStatus;

  @IsOptional() @IsEnum(BookingFulfillmentStatus)
  fulfillment_status?: BookingFulfillmentStatus;

  // module_code là bí danh của entity_type (yêu cầu liệt kê cả hai tên field riêng biệt, nhưng
  // schema hiện tại chỉ có MỘT cột `entity_type` — không thêm cột mới ở Phase 2 vì "Không phá
  // migration đã phát hành" chỉ cho phép migration MỚI, không bắt buộc phải thêm cột cho tính
  // năng query). Nếu cả hai được truyền và KHÁC nhau, coi là lỗi input (BookingsService.list).
  @IsOptional() @IsIn(BOOKABLE_ENTITY_TYPES)
  module_code?: BookableEntityType;

  @IsOptional() @IsIn(BOOKABLE_ENTITY_TYPES)
  entity_type?: BookableEntityType;

  @IsOptional() @IsISO8601()
  date_from?: string;

  @IsOptional() @IsISO8601()
  @IsAfter('date_from')
  date_to?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number;

  @IsOptional() @IsIn(BOOKING_SORT_FIELDS)
  sort_by?: BookingSortField;

  @IsOptional() @IsIn(['asc', 'desc'])
  sort_dir?: 'asc' | 'desc';
}
