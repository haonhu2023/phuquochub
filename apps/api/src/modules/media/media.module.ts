import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Media } from './entities/media.entity';
import { MediaRepository } from './repositories/media.repository';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';

// Media Upload Foundation (2026-07-30): presign/register wired up. Resize/thumbnails/EXIF/AI
// remain out of scope. StorageService/RedisService are @Global (core/storage, core/redis) — no
// explicit import needed here.
@Module({
  imports: [TypeOrmModule.forFeature([Media])],
  controllers: [MediaController],
  providers: [MediaRepository, MediaService],
  exports: [TypeOrmModule, MediaRepository],
})
export class MediaModule {}
