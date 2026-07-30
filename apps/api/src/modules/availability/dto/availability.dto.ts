import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';
import { BOOKABLE_ENTITY_TYPES, BookableEntityType } from '../../bookings/booking.enums';

// Cross-field: giống hệt IsAfter của bookings.dto.ts (service_end_at > service_start_at) —
// KHÔNG import chéo module (bookings.dto.ts's IsAfter không export) vì Availability là module
// tổng quát, không phụ thuộc Bookings — định nghĩa lại tại chỗ, cùng logic, tách biệt module.
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
          if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return true;
          return a.getTime() > b.getTime();
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} phải sau ${args.constraints[0]}`;
        },
      },
    });
  };
}

// Availability & Inventory Foundation — KHÔNG có business logic riêng cho hotel/tour/...:
// entity_type chỉ xác định "cái gì" giữ dung lượng này, AvailabilityService không diễn giải gì
// thêm từ giá trị này. `place_id` được yêu cầu tường minh (không tự suy ra từ entity_id) — cùng
// nguyên tắc CreateBookingRequestDto, cưỡng chế khớp nhau ở tầng service (xem
// AvailabilityService.createSlot).
export class CreateAvailabilitySlotDto {
  @IsIn(BOOKABLE_ENTITY_TYPES)
  entity_type!: BookableEntityType;

  @IsUUID('4')
  entity_id!: string;

  @IsUUID('4')
  place_id!: string;

  @IsISO8601()
  slot_start!: string;

  @IsOptional() @IsISO8601()
  @IsAfter('slot_start')
  slot_end?: string;

  @IsInt() @Min(1) @Max(100_000)
  total_capacity!: number;
}

export const AVAILABILITY_SORT_FIELDS = ['slot_start', 'created_at'] as const;
export type AvailabilitySortField = (typeof AVAILABILITY_SORT_FIELDS)[number];

export class ListAvailabilityQueryDto {
  @IsOptional() @IsIn(BOOKABLE_ENTITY_TYPES)
  entity_type?: BookableEntityType;

  @IsOptional() @IsUUID('4')
  entity_id?: string;

  @IsOptional() @IsUUID('4')
  place_id?: string;

  @IsOptional() @IsISO8601()
  date_from?: string;

  @IsOptional() @IsISO8601()
  @IsAfter('date_from')
  date_to?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number;

  @IsOptional() @IsIn(AVAILABILITY_SORT_FIELDS)
  sort_by?: AvailabilitySortField;

  @IsOptional() @IsIn(['asc', 'desc'])
  sort_dir?: 'asc' | 'desc';
}
