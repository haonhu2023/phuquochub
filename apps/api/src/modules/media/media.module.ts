import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Media } from './entities/media.entity';
import { MediaRepository } from './repositories/media.repository';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { MediaCleanupService } from './media-cleanup.service';

// Media Upload Foundation (2026-07-30): presign/register wired up. Resize/thumbnails/EXIF/AI
// remain out of scope. StorageService/RedisService/AuditService are @Global (core/storage,
// core/redis, core/audit) — no explicit import needed here.
// Media Orphan Cleanup (2026-08-02): MediaCleanupService exported so the standalone
// scripts/clean-orphan-media.ts runner can resolve it from a NestFactory.createApplicationContext
// — no HTTP route added, no scheduler wired (see execution plan §6).
@Module({
  imports: [TypeOrmModule.forFeature([Media])],
  controllers: [MediaController],
  providers: [MediaRepository, MediaService, MediaCleanupService],
  exports: [TypeOrmModule, MediaRepository, MediaCleanupService],
})
export class MediaModule {}
