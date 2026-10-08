import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SavedItem } from '../entities/saved-item.entity';
import { SavedItemTargetType } from '../saved-items.enums';

@Injectable()
export class SavedItemsRepository {
  constructor(@InjectRepository(SavedItem) private readonly repo: Repository<SavedItem>) {}

  findOne(userId: string, targetType: SavedItemTargetType, targetId: string): Promise<SavedItem | null> {
    return this.repo.findOne({ where: { userId, targetType, targetId } });
  }

  async create(userId: string, targetType: SavedItemTargetType, targetId: string): Promise<SavedItem> {
    // Idempotent — lưu lại một tin đã lưu không tạo dòng thứ hai, không ném lỗi UNIQUE lên người
    // dùng (gọi lại "lưu" trên một tin đã lưu không phải một thao tác sai, xem migration comment).
    await this.repo
      .createQueryBuilder()
      .insert()
      .values({ userId, targetType, targetId })
      .orIgnore()
      .execute();
    return (await this.findOne(userId, targetType, targetId))!;
  }

  async remove(userId: string, targetType: SavedItemTargetType, targetId: string): Promise<void> {
    await this.repo.delete({ userId, targetType, targetId });
  }

  listMine(userId: string): Promise<SavedItem[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }
}
