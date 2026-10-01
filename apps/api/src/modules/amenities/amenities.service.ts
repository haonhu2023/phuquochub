import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { AmenitiesRepository } from './repositories/amenities.repository';
import { PlacesService } from '../places/places.service';
import { PlaceStatus } from '../places/place.enums';
import { AuditService } from '../../core/audit/audit.service';
import { CacheInvalidationService } from '../../core/cache-invalidation/cache-invalidation.service';

@Injectable()
export class AmenitiesService {
  constructor(
    private readonly repo: AmenitiesRepository,
    private readonly placesService: PlacesService,
    private readonly audit: AuditService,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  listAll(group?: string) {
    return this.repo.listAll(group);
  }

  listForPlace(placeId: string) {
    return this.repo.listForPlace(placeId);
  }

  // ADR-016: thay toàn bộ tiện ích của place là ghi nội dung đặc quyền — ghi audit + invalidate
  // cache khi đã published, cùng khuôn PlacesService.updateFaqs/HotelsService.updateDetails.
  //
  // CAS (2026-09-30): `expectedVersion` không khớp `places.content_version` hiện tại → 409, không
  // ghi gì, không audit, không invalidate cache — xem HotelsRepository.upsertDetails's ghi chú.
  async updateForPlace(placeId: string, codes: string[], expectedVersion: number, userId: string) {
    const { invalidCodes, conflict, newVersion } = await this.repo.setForPlace(placeId, codes, expectedVersion);
    if (invalidCodes.length > 0) {
      throw new BadRequestException(`Mã tiện ích không tồn tại: ${invalidCodes.join(', ')}`);
    }
    if (conflict) {
      throw new ConflictException(
        `Địa điểm vừa được người khác sửa (mong đợi content_version=${expectedVersion}) — tải lại và thử lại.`,
      );
    }
    await this.audit.record({
      event: 'place.amenities_replaced',
      entityType: 'place',
      entityId: placeId,
      actorId: userId,
      permission: 'Place.Edit.Managed',
      context: { amenity_count: codes.length },
    });
    const place = await this.placesService.getSlugAndStatus(placeId);
    if (place?.status === PlaceStatus.PUBLISHED) {
      void this.cacheInvalidation.invalidatePlace(place.slug);
    }
    const amenities = await this.repo.listForPlace(placeId);
    return { amenities, content_version: newVersion };
  }
}
