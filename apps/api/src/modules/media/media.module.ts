import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Media } from './entities/media.entity';
import { MediaRepository } from './repositories/media.repository';

// Sprint 5 sẽ thêm upload/presign/resize. Sprint 2: MediaRepository đọc gallery Place cho
// trang chi tiết. Vẫn đăng ký entity cho quan hệ Place.cover + bảng media (exclusive arc).
@Module({
  imports: [TypeOrmModule.forFeature([Media])],
  providers: [MediaRepository],
  exports: [TypeOrmModule, MediaRepository],
})
export class MediaModule {}
