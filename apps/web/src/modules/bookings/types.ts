// Giai đoạn 3 (chiến lược data-hub) — khớp apps/api/src/modules/bookings/bookings.mapper.ts. Chỉ 3
// loại trang công khai hiện có nút "Đặt chỗ" (hotels/restaurants/tours) — event/transport tồn tại
// ở API (BOOKABLE_ENTITY_TYPES) nhưng chưa có trang chi tiết công khai nào trên web.
export const BOOKABLE_ENTITY_TYPES = ['hotel', 'restaurant', 'tour'] as const;
export type BookableEntityType = (typeof BOOKABLE_ENTITY_TYPES)[number];

export const BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled', 'expired'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  cancelled: 'Đã huỷ',
  expired: 'Đã hết hạn giữ chỗ',
};

// Response công khai (POST /bookings, GET /bookings/:bookingCode) — KHÔNG có "id" nội bộ,
// booking_code là định danh duy nhất khách giữ được.
export interface BookingResponse {
  booking_code: string;
  booking_type: string | null;
  entity_type: BookableEntityType;
  entity_id: string;
  place_id: string;
  currency_code: string;
  booking_status: BookingStatus;
  payment_status: string;
  fulfillment_status: string;
  service_start_at: string | null;
  service_end_at: string | null;
  party_size: number;
  subtotal: number;
  discount: number;
  fees: number;
  grand_total: number;
  guest_note: string | null;
  created_at: string;
}

// Response đặc quyền (GET /bookings/mine, Giai đoạn 3) — có "id" nội bộ (cần để gọi confirm/cancel)
// — KHÔNG BAO GIỜ có internal_note (xem booking.md §2.6, bất biến giữ nguyên kể cả ở kênh chủ cơ sở).
export interface BookingAdminCardResponse {
  id: string;
  booking_code: string;
  booking_type: string | null;
  entity_type: BookableEntityType;
  entity_id: string;
  place_id: string;
  customer_user_id: string | null;
  currency_code: string;
  booking_status: BookingStatus;
  payment_status: string;
  fulfillment_status: string;
  service_start_at: string | null;
  service_end_at: string | null;
  party_size: number;
  grand_total: number;
  created_at: string;
  updated_at: string;
}

// "Tối giản" (Owner Decision, bắt đầu Giai đoạn 3) — form phía khách chỉ hỏi ngày giờ + số người +
// ghi chú, ẨN hẳn khái niệm items/giá (API vẫn yêu cầu items[] — xem bookings.api.ts's
// createGuestBooking() tự dựng 1 item nội bộ `{label: 'Giữ chỗ', quantity: 1, unit_price: 0}`).
export interface CreateGuestBookingInput {
  entity_type: BookableEntityType;
  entity_id: string;
  place_id: string;
  service_start_at?: string;
  party_size: number;
  guest_note?: string;
}
