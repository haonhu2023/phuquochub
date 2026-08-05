// Hình dạng `business_claims.evidence` (JSONB) — business.md §2 "Tham chiếu bằng chứng
// (giấy phép/hóa đơn/ảnh mặt tiền/xác minh SĐT) — riêng tư, chỉ Moderator". `reference` là tham
// chiếu (media id đã upload, hoặc chuỗi tự do cho SĐT/tài liệu) — KHÔNG lưu file nhị phân ở đây.
export enum BusinessClaimEvidenceType {
  BUSINESS_LICENSE = 'business_license',
  INVOICE = 'invoice',
  STOREFRONT_PHOTO = 'storefront_photo',
  PHONE_VERIFICATION = 'phone_verification',
  OTHER = 'other',
}

export interface BusinessClaimEvidenceItem {
  type: BusinessClaimEvidenceType;
  reference: string;
  note?: string;
}
