import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EvidenceArtifact } from './entities/evidence-artifact.entity';
import { PlaceTranslationEvidenceLink } from './entities/place-translation-evidence-link.entity';
import { PlaceFieldEvidenceLink } from './entities/place-field-evidence-link.entity';
import { EvidenceArtifactsRepository } from './repositories/evidence-artifacts.repository';
import { PlaceFieldEvidenceLinksRepository } from './repositories/place-field-evidence-links.repository';
import { EvidenceService } from './evidence.service';
import { PlacesModule } from '../places/places.module';

// Không có controller — chưa có yêu cầu API surface, cùng giai đoạn với PlaceExternalIdentifiersModule.
//
// Place-field evidence V0: import PlacesModule chỉ để dùng PlacesRepository.existsById() (đã có
// sẵn, JSDoc của chính nó nêu rõ đây là seam liên-module cho "place_id này có hợp lệ không" —
// ReviewsService.create là caller hiện có). Chiều phụ thuộc AN TOÀN: PlacesModule (và toàn bộ
// module nó tự import — Categories/Contacts/Prices/Media/Revisions/Rbac/Sources/PlaceTranslations/
// Locales) KHÔNG import ngược EvidenceModule ở đâu cả (duy nhất AppModule import EvidenceModule
// trước thay đổi này) — không có vòng lặp.
@Module({
  imports: [TypeOrmModule.forFeature([EvidenceArtifact, PlaceTranslationEvidenceLink, PlaceFieldEvidenceLink]), PlacesModule],
  providers: [EvidenceArtifactsRepository, PlaceFieldEvidenceLinksRepository, EvidenceService],
  exports: [EvidenceService],
})
export class EvidenceModule {}
