import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EvidenceArtifact } from './entities/evidence-artifact.entity';
import { PlaceTranslationEvidenceLink } from './entities/place-translation-evidence-link.entity';
import { EvidenceArtifactsRepository } from './repositories/evidence-artifacts.repository';
import { EvidenceService } from './evidence.service';

// Không có controller — chưa có yêu cầu API surface, cùng giai đoạn với PlaceExternalIdentifiersModule.
@Module({
  imports: [TypeOrmModule.forFeature([EvidenceArtifact, PlaceTranslationEvidenceLink])],
  providers: [EvidenceArtifactsRepository, EvidenceService],
  exports: [EvidenceService],
})
export class EvidenceModule {}
