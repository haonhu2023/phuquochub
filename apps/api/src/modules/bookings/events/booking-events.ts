// Booking Application Layer (Phase 2) — CHỈ abstraction kiến trúc cho domain event, KHÔNG tích
// hợp Notification/Kafka/RabbitMQ (ngoài phạm vi rõ ràng của yêu cầu). Mục đích: khi một
// notification/queue adapter thật được xây (sprint sau), nó chỉ cần implement
// `BookingEventPublisher` và được wire vào BookingsModule qua DI token dưới đây — KHÔNG cần sửa
// BookingsService (đã gọi `publish()` sẵn tại đúng 3 điểm vòng đời).

export class BookingCreatedEvent {
  readonly type = 'BookingCreated' as const;
  constructor(
    public readonly bookingId: string,
    public readonly bookingCode: string,
    public readonly entityType: string,
    public readonly placeId: string,
    public readonly occurredAt: Date = new Date(),
  ) {}
}

export class BookingConfirmedEvent {
  readonly type = 'BookingConfirmed' as const;
  constructor(
    public readonly bookingId: string,
    public readonly bookingCode: string,
    public readonly occurredAt: Date = new Date(),
  ) {}
}

export class BookingCancelledEvent {
  readonly type = 'BookingCancelled' as const;
  constructor(
    public readonly bookingId: string,
    public readonly bookingCode: string,
    public readonly occurredAt: Date = new Date(),
  ) {}
}

export type BookingDomainEvent = BookingCreatedEvent | BookingConfirmedEvent | BookingCancelledEvent;

// DI token — dùng thay vì tham chiếu class trực tiếp, để có thể swap implementation (một adapter
// Notification/Kafka/RabbitMQ thật) mà không đổi chữ ký constructor nơi tiêm (BookingsService).
export const BOOKING_EVENT_PUBLISHER = Symbol('BOOKING_EVENT_PUBLISHER');

export interface BookingEventPublisher {
  publish(event: BookingDomainEvent): void | Promise<void>;
}
