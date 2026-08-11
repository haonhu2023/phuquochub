import type { ContactTypeValue } from './types';

// Nhãn hiển thị cho từng loại liên hệ — CÙNG mười giá trị CONTACT_TYPES thật ở backend
// (contacts.dto.ts), không suy diễn thêm loại nào.
export const CONTACT_TYPE_LABELS: Record<ContactTypeValue, string> = {
  HOTLINE: 'Hotline',
  PHONE: 'Điện thoại',
  EMAIL: 'Email',
  WEBSITE: 'Website',
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  ZALO: 'Zalo',
  YOUTUBE: 'YouTube',
  OTHER: 'Khác',
};

export function contactTypeLabel(type: string): string {
  return (CONTACT_TYPE_LABELS as Record<string, string>)[type] ?? type;
}

// Loại input HTML phù hợp nhất cho từng contact_type — CHỈ để cải thiện UX nhập liệu (bàn phím
// số điện thoại trên di động, kiểm định dạng email/URL cơ bản của trình duyệt). KHÔNG thêm ràng
// buộc nào chặt hơn backend: backend chỉ kiểm `@IsString() @MaxLength(300)` cho `value` (không
// kiểm định dạng số điện thoại — không giả định số Việt Nam), `type="tel"` không có `pattern` nào
// ràng buộc thêm.
export type ContactValueInputType = 'tel' | 'email' | 'url' | 'text';

export const CONTACT_VALUE_INPUT_TYPE: Record<ContactTypeValue, ContactValueInputType> = {
  HOTLINE: 'tel',
  PHONE: 'tel',
  ZALO: 'tel',
  EMAIL: 'email',
  WEBSITE: 'url',
  FACEBOOK: 'url',
  INSTAGRAM: 'url',
  TIKTOK: 'url',
  YOUTUBE: 'url',
  OTHER: 'text',
};
