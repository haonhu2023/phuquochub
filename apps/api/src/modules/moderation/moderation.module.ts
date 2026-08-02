import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModerationCase } from './entities/moderation-case.entity';
import { Report } from './entities/report.entity';
import { ModerationCasesRepository } from './repositories/moderation-cases.repository';
import { ReportsRepository } from './repositories/reports.repository';
import { ModerationService } from './moderation.service';
import { ModerationController } from './moderation.controller';
import { MediaModule } from '../media/media.module';
import { MODERATION_EVENT_PUBLISHER } from './events/moderation-events';
import { LoggingModerationEventPublisher } from './events/logging-moderation-event-publisher';

// Moderation Foundation. M1 (ADR-018): entities + repositories. M2 (Queue Read API): read-only
// service + controller. M3 (Media Decision Workflow): decide() needs MediaRepository (imports
// MediaModule — MediaModule imports nothing back, no cycle) and the event-publisher token
// (D12, token-based DI so a real Kafka/Notification adapter can be swapped in later without
// touching ModerationService/ReviewsService). ReviewsModule imports THIS module for the same
// token (T1 emits ReviewCreated/MediaAutoPublished through it too). Case và report là hai bảng
// của MỘT miền — một module cho cả hai, đúng cách BookingsModule gộp Booking+BookingItem.
@Module({
  imports: [TypeOrmModule.forFeature([ModerationCase, Report]), MediaModule],
  controllers: [ModerationController],
  providers: [
    ModerationCasesRepository,
    ReportsRepository,
    ModerationService,
    { provide: MODERATION_EVENT_PUBLISHER, useClass: LoggingModerationEventPublisher },
  ],
  exports: [ModerationCasesRepository, ReportsRepository, MODERATION_EVENT_PUBLISHER],
})
export class ModerationModule {}
