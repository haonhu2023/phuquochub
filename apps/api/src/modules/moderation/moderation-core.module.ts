import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModerationCase } from './entities/moderation-case.entity';
import { Report } from './entities/report.entity';
import { ModerationCasesRepository } from './repositories/moderation-cases.repository';
import { ReportsRepository } from './repositories/reports.repository';
import { ModerationReportsService } from './moderation-reports.service';
import { MODERATION_EVENT_PUBLISHER } from './events/moderation-events';
import { LoggingModerationEventPublisher } from './events/logging-moderation-event-publisher';

// Moderation Foundation M5 (User Reporting). Extracted from `ModerationModule` as a LEAF module —
// zero imports of Media/Reviews/Places/Rbac — specifically to break a circular dependency that M5
// would otherwise create.
//
// The problem: `ModerationModule` already imports `MediaModule` (M3, for MediaRepository inside
// decide()). M5 needs `POST /media/{id}/report` to create a `moderation_cases`/`reports` row,
// which means `MediaModule` needs `ModerationCasesRepository`/`ReportsRepository`/the
// event-publisher token — i.e. it needs to import `ModerationModule`. `MediaModule ->
// ModerationModule -> MediaModule` would be a genuine two-hop cycle, not the kind of thing raw
// cross-table SQL (the M2/M4 workaround for a similar problem with ReviewsModule) can sidestep,
// since here BOTH directions are real: Moderation genuinely needs Media for decide(), and Media
// genuinely needs Moderation for report(). The clean fix is to split off the parts Media (and
// Reviews) actually need — the two repositories and the event token — into this dependency-free
// module, which both `ModerationModule` and `MediaModule`/`ReviewsModule` can import directly
// without ever importing each other.
//
// `ModerationReportsService` (T3, the report-creation transaction) lives HERE rather than in
// `ModerationService`/`ModerationModule`, for the same reason — it is the one piece of moderation
// logic every content-domain module needs to call directly.
@Module({
  imports: [TypeOrmModule.forFeature([ModerationCase, Report])],
  providers: [
    ModerationCasesRepository,
    ReportsRepository,
    ModerationReportsService,
    { provide: MODERATION_EVENT_PUBLISHER, useClass: LoggingModerationEventPublisher },
  ],
  exports: [ModerationCasesRepository, ReportsRepository, ModerationReportsService, MODERATION_EVENT_PUBLISHER],
})
export class ModerationCoreModule {}
