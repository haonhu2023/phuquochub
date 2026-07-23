import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Media } from '../entities/media.entity';
import { MediaStatus } from '../media.enums';

// Repository `media`. Sprint 2: chỉ đọc gallery Place (published) cho trang chi tiết.
// Upload/presign/resize thuộc Sprint 5.
@Injectable()
export class MediaRepository {
  constructor(
    @InjectRepository(Media)
    private readonly repo: Repository<Media>,
  ) {}

  /** Gallery đã duyệt của một Place, theo sort_order (dùng partial index idx_media_place). */
  listPublishedByPlace(placeId: string): Promise<Media[]> {
    return this.repo.find({
      where: { placeId, status: MediaStatus.PUBLISHED, deletedAt: IsNull() },
      order: { sortOrder: 'ASC' },
    });
  }
}
