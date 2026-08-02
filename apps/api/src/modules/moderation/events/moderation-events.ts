import { ModerationDecision, ModerationTargetType } from '../moderation.enums';

// ADR-018 D12 — CHỈ trừu tượng hoá sự kiện, KHÔNG broker/scheduler/notification thật. Sao chép
// nguyên hình dạng `BOOKING_EVENT_PUBLISHER`/`BookingDomainEvent` — khi một adapter thật (Kafka/
// RabbitMQ/Notification) được xây, nó chỉ cần implement `ModerationEventPublisher` và wire vào
// ModerationModule qua DI token dưới đây, KHÔNG cần sửa ReviewsService/ModerationService (đã gọi
// `publish()` sẵn tại đúng các điểm vòng đời — T1/T2, moderation-design.md §7).

export class ReviewCreatedEvent {
  readonly type = 'ReviewCreated' as const;
  constructor(
    public readonly reviewId: string,
    public readonly placeId: string,
    public readonly userId: string,
    public readonly occurredAt: Date = new Date(),
  ) {}
}

// Phát MỘT lần cho MỖI media auto-publish thành công (T1) — không gộp thành một event mảng, cùng
// hạt "một dòng audit/event cho mỗi media" mà moderation-design.md §7 T1 yêu cầu.
export class MediaAutoPublishedEvent {
  readonly type = 'MediaAutoPublished' as const;
  constructor(
    public readonly mediaId: string,
    public readonly reviewId: string,
    public readonly occurredAt: Date = new Date(),
  ) {}
}

// T2 — nội dung chuyển sang trạng thái công khai (approve: pending->published, hoặc
// restore với target_status=published). KHÔNG phát cho reject/restore-về-pending — nội dung đó
// KHÔNG trở nên "được duyệt", không có sự kiện thị giác nào đúng ngữ nghĩa cho hai nhánh đó (xem
// CaseResolved bên dưới, vốn LUÔN phát bất kể quyết định là gì).
export class ContentApprovedEvent {
  readonly type = 'ContentApproved' as const;
  constructor(
    public readonly targetType: ModerationTargetType,
    public readonly targetId: string,
    public readonly caseId: string,
    public readonly occurredAt: Date = new Date(),
  ) {}
}

// T2 — nội dung đã công khai bị ẩn (hide: published->hidden).
export class ContentHiddenEvent {
  readonly type = 'ContentHidden' as const;
  constructor(
    public readonly targetType: ModerationTargetType,
    public readonly targetId: string,
    public readonly caseId: string,
    public readonly occurredAt: Date = new Date(),
  ) {}
}

// T2 — LUÔN phát khi một case đóng (resolved HOẶC dismissed), bất kể quyết định — nguồn duy nhất
// để theo dõi năng suất/độ trễ xử lý hàng chờ, không phụ thuộc việc quyết định đó có đổi trạng
// thái hiển thị hay không (reject/dismiss/restore-về-pending không có event hiển thị riêng, xem
// ghi chú ở ContentApprovedEvent, nhưng VẪN có CaseResolved).
export class CaseResolvedEvent {
  readonly type = 'CaseResolved' as const;
  constructor(
    public readonly caseId: string,
    public readonly decision: ModerationDecision,
    public readonly occurredAt: Date = new Date(),
  ) {}
}

export type ModerationDomainEvent =
  | ReviewCreatedEvent
  | MediaAutoPublishedEvent
  | ContentApprovedEvent
  | ContentHiddenEvent
  | CaseResolvedEvent;

export const MODERATION_EVENT_PUBLISHER = Symbol('MODERATION_EVENT_PUBLISHER');

export interface ModerationEventPublisher {
  publish(event: ModerationDomainEvent): void | Promise<void>;
}
