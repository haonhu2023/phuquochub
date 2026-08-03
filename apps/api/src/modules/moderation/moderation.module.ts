import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModerationCase } from './entities/moderation-case.entity';
import { Report } from './entities/report.entity';
import { ModerationCasesRepository } from './repositories/moderation-cases.repository';
import { ReportsRepository } from './repositories/reports.repository';
import { ModerationService } from './moderation.service';
import { ModerationController } from './moderation.controller';
import { MediaModule } from '../media/media.module';
import { PlacesModule } from '../places/places.module';
import { RbacModule } from '../rbac/rbac.module';
import { MODERATION_EVENT_PUBLISHER } from './events/moderation-events';
import { LoggingModerationEventPublisher } from './events/logging-moderation-event-publisher';

// Moderation Foundation. M1 (ADR-018): entities + repositories. M2 (Queue Read API): read-only
// service + controller. M3 (Media Decision Workflow): decide() needs MediaRepository (imports
// MediaModule — MediaModule imports nothing back, no cycle) and the event-publisher token
// (D12, token-based DI so a real Kafka/Notification adapter can be swapped in later without
// touching ModerationService/ReviewsService). ReviewsModule imports THIS module for the same
// token (T1 emits ReviewCreated/MediaAutoPublished through it too). Case và report là hai bảng
// của MỘT miền — một module cho cả hai, đúng cách BookingsModule gộp Booking+BookingItem.
//
// M4 (Review Decision Workflow) adds `PlacesModule` (PlacesRepository.recalculateRating — INV-4)
// and `RbacModule` (AuthorizationService — decide() selects Media.Moderate vs Review.Moderate by
// the case's target_type, a runtime value, so it cannot be a static @RequirePermissions decorator
// on the controller). NEITHER creates a cycle: PlacesModule's own imports (Categories/Contacts/
// Prices/Media/Revisions) never import ModerationModule or ReviewsModule; RbacModule imports only
// TypeORM entities. `ReviewsRepository` itself is deliberately NOT injected here — ReviewsModule
// already imports ModerationModule (for the event-publisher token above), so importing
// ReviewsModule back would be the actual cycle; the review row itself is read/written via raw SQL
// on `ModerationCasesRepository` instead (same precedent as `findTargetPreview()`).
@Module({
  imports: [TypeOrmModule.forFeature([ModerationCase, Report]), MediaModule, PlacesModule, RbacModule],
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
