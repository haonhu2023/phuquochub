import { Injectable, Logger } from '@nestjs/common';
import { BookingDomainEvent, BookingEventPublisher } from './booking-events';

// Implementation MẶC ĐỊNH của BookingEventPublisher cho slice này — chỉ log có cấu trúc, KHÔNG
// gửi notification thật, KHÔNG đẩy Kafka/RabbitMQ. Đây là "abstraction" theo đúng nghĩa yêu cầu:
// tồn tại, được gọi đúng chỗ, nhưng không tích hợp broker/notification nào.
@Injectable()
export class LoggingBookingEventPublisher implements BookingEventPublisher {
  private readonly logger = new Logger(LoggingBookingEventPublisher.name);

  publish(event: BookingDomainEvent): void {
    this.logger.log(
      `${event.type} bookingId=${event.bookingId} bookingCode=${event.bookingCode} occurredAt=${event.occurredAt.toISOString()}`,
    );
  }
}
