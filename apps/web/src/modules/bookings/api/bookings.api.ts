import { apiPost, apiGetPaginatedAuth } from '@/lib/http';
import type { PaginationMeta } from '@phuquochub/shared-types';
import type { BookingAdminCardResponse, BookingResponse, CreateGuestBookingInput } from '../types';

// "Tối giản" (Owner Decision, bắt đầu Giai đoạn 3) — form phía khách KHÔNG hỏi items/giá; tự dựng
// MỘT item nội bộ cố định (nhãn "Giữ chỗ", quantity 1 — party_size đã mang số người riêng, KHÔNG
// dùng lại làm quantity item vì CreateBookingItemDto giới hạn quantity ≤ 50 còn party_size cho phép
// tới 200). unit_price=0 khớp đúng MVP "giữ chỗ không thanh toán" — grand_total luôn 0.
export async function createGuestBooking(input: CreateGuestBookingInput, accessToken: string): Promise<BookingResponse> {
  return apiPost<BookingResponse>('/bookings', accessToken, {
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    place_id: input.place_id,
    service_start_at: input.service_start_at,
    party_size: input.party_size,
    guest_note: input.guest_note,
    items: [{ label: 'Giữ chỗ', quantity: 1, unit_price: 0 }],
  });
}

// Giai đoạn 3 — GET /bookings/mine (chủ/nhân sự cơ sở). limit=50: đủ cho giai đoạn dữ liệu còn
// mỏng hiện tại, tránh xây UI phân trang đầy đủ chưa cần thiết ở MVP này — nếu total > 50,
// MyBookingsView tự hiện ghi chú "chỉ hiện N/total gần nhất" thay vì âm thầm cắt bớt không báo.
export async function listMyManagedBookings(accessToken: string): Promise<{ data: BookingAdminCardResponse[]; meta: PaginationMeta }> {
  return apiGetPaginatedAuth<BookingAdminCardResponse>('/bookings/mine?limit=50', accessToken, { cache: 'no-store' });
}

export async function confirmBooking(id: string, accessToken: string): Promise<null> {
  return apiPost<null>(`/bookings/${encodeURIComponent(id)}/confirm`, accessToken);
}

export async function cancelBooking(id: string, accessToken: string): Promise<null> {
  return apiPost<null>(`/bookings/${encodeURIComponent(id)}/cancel`, accessToken);
}
