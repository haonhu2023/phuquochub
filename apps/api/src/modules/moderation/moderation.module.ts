import { Module } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { ModerationController } from './moderation.controller';
import { ModerationCoreModule } from './moderation-core.module';
import { AiRecommendationsModule } from './ai-recommendations.module';
import { MediaModule } from '../media/media.module';
import { PlacesModule } from '../places/places.module';
import { RbacModule } from '../rbac/rbac.module';

// Moderation Foundation. M1 (ADR-018): entities + repositories. M2 (Queue Read API): read-only
// service + controller. M3 (Media Decision Workflow): decide() needs MediaRepository (imports
// MediaModule — MediaModule imports nothing back, no cycle) and the event-publisher token
// (D12, token-based DI so a real Kafka/Notification adapter can be swapped in later without
// touching ModerationService/ReviewsService).
//
// M4 (Review Decision Workflow) adds `PlacesModule` (PlacesRepository.recalculateRating — INV-4)
// and `RbacModule` (AuthorizationService — decide() selects Media.Moderate vs Review.Moderate by
// the case's target_type, a runtime value, so it cannot be a static @RequirePermissions decorator
// on the controller).
//
// M5 (User Reporting): `ModerationCasesRepository`/`ReportsRepository`/the event-publisher token
// moved OUT of this module into `ModerationCoreModule` (a dependency-free leaf) — `MediaModule`
// now needs them too (for `POST /media/{id}/report`), and this module already imports MediaModule,
// so MediaModule importing this one back would cycle. `ReviewsModule` was likewise switched to
// import `ModerationCoreModule` directly instead of this module — it only ever needed the
// repositories/token, never `ModerationService`/`ModerationController`. See
// `moderation-core.module.ts`'s own comment for the full explanation.
//
// M7 (AI Shadow Mode): `AiRecommendationsModule` is imported ONE-WAY, purely so
// `ModerationService.emitPostCommit()` can call `AiRecommendationsService.evaluateModeratorDecision()`
// AFTER T2 commits (INV-9-style: never inside the decision transaction, never able to affect its
// outcome). `AiRecommendationsModule` itself only imports `ModerationCoreModule` — it never imports
// `ModerationModule` back, so this stays a one-way edge, not a cycle.
@Module({
  imports: [ModerationCoreModule, AiRecommendationsModule, MediaModule, PlacesModule, RbacModule],
  controllers: [ModerationController],
  providers: [ModerationService],
})
export class ModerationModule {}
