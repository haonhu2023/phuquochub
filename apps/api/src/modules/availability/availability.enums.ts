// Booking Availability & Inventory Foundation — trạng thái hold TÁCH RIÊNG khỏi booking_status
// (cùng nguyên tắc booking.enums.ts: vòng đời booking và vòng đời hold tồn kho là hai khái niệm
// khác nhau, dù liên kết 1:1 qua booking_id).
export enum InventoryHoldStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  RELEASED = 'released',
  CONFIRMED = 'confirmed',
}
