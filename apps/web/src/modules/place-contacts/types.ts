import type { PlaceContact } from '@phuquochub/shared-types';

// Kiểu FE cho Place Contact Management. Wire format snake_case, khớp
// apps/api/src/modules/contacts/{dto/contacts.dto.ts,contacts.service.ts}. `PlaceContact` (đọc)
// đã có sẵn trong @phuquochub/shared-types — dùng thẳng, không tạo bản sao.

// Khớp CONTACT_TYPES (contacts.dto.ts, backend @IsIn — danh sách ĐÓNG, không phải free string).
// Không phát minh giá trị mới.
export const CONTACT_TYPES = [
  'HOTLINE',
  'PHONE',
  'EMAIL',
  'WEBSITE',
  'FACEBOOK',
  'INSTAGRAM',
  'TIKTOK',
  'ZALO',
  'YOUTUBE',
  'OTHER',
] as const;
export type ContactTypeValue = (typeof CONTACT_TYPES)[number];

export type { PlaceContact };

// Khớp CreateContactDto/UpdateContactDto — `display_order` CỐ Ý không có ở form MVP này (backend
// mặc định 0, không có UI sắp xếp thủ công ở bản này — xem báo cáo cuối task).
export interface ContactFormInput {
  contact_type: ContactTypeValue;
  value: string;
  label: string | null;
  is_primary: boolean;
}
