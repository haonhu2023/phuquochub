import { Module } from '@nestjs/common';
import { PlaceEditProposalPhotosService } from './place-edit-proposal-photos.service';
import { PlaceEditProposalPhotosController } from './place-edit-proposal-photos.controller';
import { PlaceEditProposalsModule } from '../place-edit-proposals/place-edit-proposals.module';
import { MediaModule } from '../media/media.module';
import { ModerationCoreModule } from '../moderation/moderation-core.module';

// StorageService/RedisService/MediaUrlService đều @Global — không cần import tường minh.
// `MediaModule` CHỈ để lấy `MediaRepository` (đã export sẵn) — KHÔNG tiêm `MediaService`, xem
// doc comment dài ở service này giải thích vì sao (tránh cycle MediaModule<->PlaceEditProposalsModule,
// vì PlacesModule đã import MediaModule và PlaceEditProposalsModule đã import PlacesModule).
// `ModerationCoreModule` (leaf module, không phụ thuộc gì) cho `ModerationCasesRepository`.
@Module({
  imports: [PlaceEditProposalsModule, MediaModule, ModerationCoreModule],
  controllers: [PlaceEditProposalPhotosController],
  providers: [PlaceEditProposalPhotosService],
  exports: [PlaceEditProposalPhotosService],
})
export class PlaceEditProposalPhotosModule {}
