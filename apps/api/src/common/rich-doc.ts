import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { RichDoc, RichDocValidationError, validateRichDoc } from '@phuquochub/shared-types';

// Decorator class-validator cho field RichDoc (Gói D) — cùng mẫu `IsOpeningHours` (common/opening-hours.ts):
// kiểm cấu trúc bằng hàm thuần dùng chung với apps/web (packages/shared-types/src/rich-doc.ts),
// KHÔNG viết lại logic validate ở đây. Dùng cùng `@IsObject()` (defense-in-depth) ở DTO — không thay thế.

export function isValidRichDocValue(value: unknown): boolean {
  try {
    validateRichDoc(value);
    return true;
  } catch (err) {
    if (err instanceof RichDocValidationError) return false;
    throw err;
  }
}

export function IsRichDoc(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isRichDoc',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return isValidRichDocValue(value);
        },
        defaultMessage(args: ValidationArguments): string {
          try {
            validateRichDoc(args.value);
            return `${args.property} không hợp lệ`;
          } catch (err) {
            const message = err instanceof RichDocValidationError ? err.message : 'không hợp lệ';
            return `${args.property} sai cấu trúc RichDoc: ${message}`;
          }
        },
      },
    });
  };
}

/** Parse + validate, ném BadRequestException-compatible RichDocValidationError nếu sai. Dùng ở service khi cần throw với message chi tiết (DTO decorator chỉ trả message chung của class-validator). */
export function parseRichDoc(value: unknown): RichDoc {
  return validateRichDoc(value);
}
