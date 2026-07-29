import { Booking } from './entities/booking.entity';
import { BookingItem } from './entities/booking-item.entity';

// Khớp data-dictionary snake_case (README §Ghi chú). internal_note KHÔNG bao giờ lộ ra đây —
// đó là trường nội bộ nhân viên/chủ cơ sở, không thuộc response của khách.
export interface BookingItemResponse {
  id: string;
  label: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

// KHÔNG có "id" (uuid nội bộ) — booking_code LÀ định danh công khai duy nhất (dự án đã có public
// id cho Booking, nên không lộ thêm DB id song song, khác Place/Review vốn không có lựa chọn này).
//
// TRUST BOUNDARY: subtotal/discount/fees/grand_total phản ánh giá trị YÊU CẦU/BÁO GIÁ tại thời
// điểm đặt (tính từ unit_price client gửi trong request), CHƯA qua pricing engine xác nhận từ
// nhà cung cấp (không xây trong slice này). Không nơi nào diễn giải grand_total là giá cuối cùng
// đã xác nhận — booking_status khởi tạo luôn 'pending' đã phản ánh đúng trạng thái này.
export interface BookingResponse {
  booking_code: string;
  booking_type: string | null;
  entity_type: string;
  entity_id: string;
  place_id: string;
  currency_code: string;
  booking_status: string;
  payment_status: string;
  fulfillment_status: string;
  service_start_at: Date | null;
  service_end_at: Date | null;
  party_size: number;
  subtotal: number;
  discount: number;
  fees: number;
  grand_total: number;
  guest_note: string | null;
  created_at: Date;
  items: BookingItemResponse[];
}

export function toBookingItem(item: BookingItem): BookingItemResponse {
  return {
    id: item.id,
    label: item.label,
    quantity: item.quantity,
    unit_price: Number(item.unitPrice),
    subtotal: Number(item.subtotal),
  };
}

export function toBooking(booking: Booking, items: BookingItem[]): BookingResponse {
  return {
    booking_code: booking.bookingCode,
    booking_type: booking.bookingType,
    entity_type: booking.entityType,
    entity_id: booking.entityId,
    place_id: booking.placeId,
    currency_code: booking.currencyCode,
    booking_status: booking.bookingStatus,
    payment_status: booking.paymentStatus,
    fulfillment_status: booking.fulfillmentStatus,
    service_start_at: booking.serviceStartAt,
    service_end_at: booking.serviceEndAt,
    party_size: booking.partySize,
    subtotal: Number(booking.subtotal),
    discount: Number(booking.discount),
    fees: Number(booking.fees),
    grand_total: Number(booking.grandTotal),
    guest_note: booking.guestNote,
    created_at: booking.createdAt,
    items: items.map(toBookingItem),
  };
}
