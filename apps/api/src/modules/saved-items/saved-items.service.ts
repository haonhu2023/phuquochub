import { Injectable, NotFoundException } from '@nestjs/common';
import { SavedItemsRepository } from './repositories/saved-items.repository';
import { SavedItemTargetType } from './saved-items.enums';
import { JobListingsService } from '../job-listings/job-listings.service';
import { RealEstateListingsService } from '../real-estate-listings/real-estate-listings.service';
import { PlacesService } from '../places/places.service';

// "Lưu tin" dùng chung (mục VII/đợt 3/đợt 4 — xem migration InitSavedItems cho lý do không có
// cơ chế nào trước đó để tái dùng). Đi qua ĐÚNG service công khai của từng loại entity
// (JobListingsService.getPublicById()/RealEstateListingsService.getPublicById()) — không tự đọc
// repository của module khác — để không có đường thứ hai quyết định "tin này có công khai không"
// khác với route công khai thật đang dùng.
@Injectable()
export class SavedItemsService {
  constructor(
    private readonly repo: SavedItemsRepository,
    private readonly jobListingsService: JobListingsService,
    private readonly realEstateListingsService: RealEstateListingsService,
    private readonly placesService: PlacesService,
  ) {}

  // Trả về view công khai nếu tin còn công khai, null nếu không (tin đã đóng/hết hạn/gỡ sau khi
  // lưu) — KHÔNG ném lỗi, "Tin đã lưu" vẫn phải hiện được dòng đó với trạng thái "không còn khả dụng"
  // thay vì biến mất lặng lẽ.
  private async resolveTarget(targetType: SavedItemTargetType, targetId: string): Promise<unknown | null> {
    try {
      if (targetType === SavedItemTargetType.JOB_LISTING) {
        return await this.jobListingsService.getPublicById(targetId);
      }
      if (targetType === SavedItemTargetType.REAL_ESTATE_LISTING) {
        return await this.realEstateListingsService.getPublicById(targetId);
      }
      // 'place' (phủ hotel/restaurant/tour — cùng id, ADR-002) — cùng lý do resolveTargetPublic()
      // của ListingReportsService: getBySlug() là nơi DUY NHẤT quyết định "có công khai không".
      const meta = await this.placesService.getSlugAndStatus(targetId);
      if (!meta) return null;
      return await this.placesService.getBySlug(meta.slug);
    } catch {
      return null;
    }
  }

  async save(userId: string, targetType: SavedItemTargetType, targetId: string): Promise<void> {
    // Chỉ cho lưu tin ĐANG công khai — chặn dò tồn tại của tin draft/pending/closed của người
    // khác qua endpoint này (route công khai thật cũng áp cùng điều kiện, xem comment đầu file).
    const target = await this.resolveTarget(targetType, targetId);
    if (!target) throw new NotFoundException('Không tìm thấy tin để lưu, hoặc tin không còn công khai');
    await this.repo.create(userId, targetType, targetId);
  }

  async unsave(userId: string, targetType: SavedItemTargetType, targetId: string): Promise<void> {
    await this.repo.remove(userId, targetType, targetId);
  }

  async listMine(userId: string) {
    const rows = await this.repo.listMine(userId);
    const resolved = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        target_type: row.targetType,
        target_id: row.targetId,
        saved_at: row.createdAt.toISOString(),
        listing: await this.resolveTarget(row.targetType, row.targetId),
      })),
    );
    return resolved;
  }
}
