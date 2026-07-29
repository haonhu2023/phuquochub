// Ba trạng thái TÁCH RIÊNG (Booking Request Foundation) — vòng đời booking, vòng đời tiền, và
// vòng đời giao dịch dịch vụ là ba khái niệm khác nhau, không gộp một cột.
export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

// Chỉ trạng thái — KHÔNG có cổng thanh toán thật đứng sau (chưa tích hợp provider nào).
export enum BookingPaymentStatus {
  UNPAID = 'unpaid',
  PAID = 'paid',
  REFUNDED = 'refunded',
}

export enum BookingFulfillmentStatus {
  PENDING = 'pending',
  FULFILLED = 'fulfilled',
  NO_SHOW = 'no_show',
  CANCELLED = 'cancelled',
}

// Module bookable hợp lệ cho `entity_type` (đa hình, ADR-003 — lowercase snake_case, khớp
// price_history.entity_type). Foundation chỉ hỗ trợ 5 satellite hiện có.
export const BOOKABLE_ENTITY_TYPES = ['hotel', 'restaurant', 'tour', 'event', 'transport'] as const;
export type BookableEntityType = (typeof BOOKABLE_ENTITY_TYPES)[number];
