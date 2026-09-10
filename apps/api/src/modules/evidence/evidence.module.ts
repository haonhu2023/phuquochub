import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EvidenceArtifact } from './entities/evidence-artifact.entity';
import { PlaceTranslationEvidenceLink } from './entities/place-translation-evidence-link.entity';
import { PlaceFieldEvidenceLink } from './entities/place-field-evidence-link.entity';
import { EvidenceReview } from './entities/evidence-review.entity';
import { EvidenceArtifactsRepository } from './repositories/evidence-artifacts.repository';
import { PlaceFieldEvidenceLinksRepository } from './repositories/place-field-evidence-links.repository';
import { EvidenceReviewsRepository } from './repositories/evidence-reviews.repository';
import { EvidenceService } from './evidence.service';
import { PlacesModule } from '../places/places.module';
import { SourcesModule } from '../sources/sources.module';
import { Clock, SystemClock } from '../../common/clock';

// Không có controller — chưa có yêu cầu API surface, cùng giai đoạn với PlaceExternalIdentifiersModule.
//
// Place-field evidence V0: import PlacesModule chỉ để dùng PlacesRepository.existsById() (đã có
// sẵn, JSDoc của chính nó nêu rõ đây là seam liên-module cho "place_id này có hợp lệ không" —
// ReviewsService.create là caller hiện có). Chiều phụ thuộc AN TOÀN: PlacesModule (và toàn bộ
// module nó tự import — Categories/Contacts/Prices/Media/Revisions/Rbac/Sources/PlaceTranslations/
// Locales) KHÔNG import ngược EvidenceModule ở đâu cả (duy nhất AppModule import EvidenceModule
// trước thay đổi này) — không có vòng lặp.
//
// Opening-Hours Evidence Governance v1: import SourcesModule directly (not just transitively via
// PlacesModule) so EvidenceService.reviewEvidenceArtifact() can read a source's `type` (first-party
// classification, evidence-trust.ts's OFFICIAL_SOURCE_TYPES) via SourcesRepository — SourcesModule
// is a leaf module (no imports of its own back to EvidenceModule), so this adds no cycle either.
// Clock (common/clock.ts) is bound to SystemClock here — the one real runtime wiring point; tests
// construct EvidenceService directly with a hand-rolled Clock mock, bypassing this module entirely.
@Module({
  imports: [
    TypeOrmModule.forFeature([EvidenceArtifact, PlaceTranslationEvidenceLink, PlaceFieldEvidenceLink, EvidenceReview]),
    PlacesModule,
    SourcesModule,
  ],
  providers: [
    EvidenceArtifactsRepository,
    PlaceFieldEvidenceLinksRepository,
    EvidenceReviewsRepository,
    { provide: Clock, useClass: SystemClock },
    EvidenceService,
  ],
  exports: [EvidenceService],
})
export class EvidenceModule {}
