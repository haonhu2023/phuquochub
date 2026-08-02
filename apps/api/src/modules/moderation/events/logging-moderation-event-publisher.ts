import { Injectable, Logger } from '@nestjs/common';
import { ModerationDomainEvent, ModerationEventPublisher } from './moderation-events';

// Implementation MẶC ĐỊNH của ModerationEventPublisher — chỉ log có cấu trúc, KHÔNG gửi
// notification thật, KHÔNG đẩy Kafka/RabbitMQ (ADR-018 D12). Cùng khuôn
// `LoggingBookingEventPublisher` chính xác.
@Injectable()
export class LoggingModerationEventPublisher implements ModerationEventPublisher {
  private readonly logger = new Logger(LoggingModerationEventPublisher.name);

  publish(event: ModerationDomainEvent): void {
    this.logger.log(`${event.type} ${JSON.stringify(event)} occurredAt=${event.occurredAt.toISOString()}`);
  }
}
