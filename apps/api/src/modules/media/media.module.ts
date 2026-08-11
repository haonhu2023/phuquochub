import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Media } from './entities/media.entity';
import { MediaRepository } from './repositories/media.repository';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { PlaceMediaController } from './place-media.controller';
import { MediaCleanupService } from './media-cleanup.service';
import { ModerationCoreModule } from '../moderation/moderation-core.module';

// Media Upload Foundation (2026-07-30): presign/register wired up. Resize/thumbnails/EXIF/AI
// remain out of scope. StorageService/RedisService/AuditService are @Global (core/storage,
// core/redis, core/audit) — no explicit import needed here.
// Media Orphan Cleanup (2026-08-02): MediaCleanupService exported so the standalone
// scripts/clean-orphan-media.ts runner can resolve it from a NestFactory.createApplicationContext
// — no HTTP route added, no scheduler wired (see execution plan §6).
// Moderation Foundation M5 (User Reporting, 2026-08-03): `ModerationCoreModule` imported for
// `ModerationReportsService` (T3, POST /media/{id}/report). NOT the full `ModerationModule` —
// `ModerationModule` already imports `MediaModule` (M3, decide()'s MediaRepository dependency), so
// `MediaModule -> ModerationModule` would be a two-hop cycle. `ModerationCoreModule` is the
// dependency-free split specifically built to avoid this (see its own file comment).
@Module({
  imports: [TypeOrmModule.forFeature([Media]), ModerationCoreModule],
  controllers: [MediaController, PlaceMediaController],
  providers: [MediaRepository, MediaService, MediaCleanupService],
  exports: [TypeOrmModule, MediaRepository, MediaCleanupService],
})
export class MediaModule {}
