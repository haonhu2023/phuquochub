import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
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
import { BOOKABLE_ENTITY_TYPES, BookableEntityType } from '../booking.enums';

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
}
