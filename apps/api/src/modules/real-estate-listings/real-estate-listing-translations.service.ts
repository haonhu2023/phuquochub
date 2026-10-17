import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../core/audit/audit.service';
import { RealEstateListingTranslationsRepository } from './repositories/real-estate-listing-translations.repository';
import { RealEstateListingsRepository } from './repositories/real-estate-listings.repository';
import { RealEstateListing } from './entities/real-estate-listing.entity';
import { RealEstateListingTranslation } from './entities/real-estate-listing-translation.entity';
import { RealEstateListingTranslationStatus } from './real-estate-listings.enums';
import { DecideRealEstateListingTranslationDto, UpsertRealEstateListingTranslationDto } from './dto/real-estate-listing-translations.dto';
import { toRealEstateListingTranslationModeratorView, toRealEstateListingTranslationView } from './real-estate-listing-translations.mapper';
import { computeRealEstateListingSourceHash } from './real-estate-listing-translation-hash';

const DRAFT_REVIEW_STATUSES = new Set([
  RealEstateListingTranslationStatus.PUBLISHED,
  RealEstateListingTranslationStatus.REJECTED,
  RealEstateListingTranslationStatus.PENDING,
]);

// Gói C phần 2/2 (17/10/2026) — bản dịch tiếng Anh cho real_estate_listings. CÙNG thiết kế/bất biến
// quan trọng của JobListingTranslationsService (xem ghi chú đầy đủ ở đó): save()/submit() CHỈ đụng
// vùng NHÁP, KHÔNG BAO GIỜ đụng vùng ĐÃ DUYỆT (published*) — sửa/gửi duyệt lại một bản dịch ĐANG
// công khai không làm mất nội dung đang hiện. Tái dùng NGUYÊN quyền hiện có
// (`RealEstateListing.Create`/`RealEstateListing.Moderate` — không permission mới).
@Injectable()
export class RealEstateListingTranslationsService {
  constructor(
    private readonly translationsRepo: RealEstateListingTranslationsRepository,
    private readonly listingsRepo: RealEstateListingsRepository,
    private readonly audit: AuditService,
  ) {}

  private async loadOwnedListing(realEstateListingId: string, userId: string): Promise<RealEstateListing> {
    const row = await this.listingsRepo.findById(realEstateListingId);
    if (!row || row.createdBy !== userId) throw new NotFoundException('Không tìm thấy tin bất động sản');
    return row;
  }

  async getMine(realEstateListingId: string, userId: string) {
    const listing = await this.loadOwnedListing(realEstateListingId, userId);
    const translation = await this.translationsRepo.findByRealEstateListingId(realEstateListingId);
    return translation ? toRealEstateListingTranslationView(translation, listing) : null;
  }

  async save(realEstateListingId: string, dto: UpsertRealEstateListingTranslationDto, userId: string) {
    const listing = await this.loadOwnedListing(realEstateListingId, userId);
    const existing = await this.translationsRepo.findByRealEstateListingId(realEstateListingId);
    const newHash = computeRealEstateListingSourceHash(listing);

    if (!existing) {
      const entity = this.translationsRepo.create(realEstateListingId);
      entity.title = dto.title ?? null;
      entity.description = dto.description ?? null;
      entity.utilitiesNote = dto.utilities_note ?? null;
      entity.legalStatusNote = dto.legal_status_note ?? null;
      entity.sourceContentHash = newHash;
      const saved = await this.translationsRepo.insertNew(entity);
      await this.audit.record({
        event: 'real_estate_listing_translation.saved',
        entityType: 'real_estate_listing_translation',
        entityId: saved.id,
        actorId: userId,
        after: { title: saved.title, description: saved.description, utilities_note: saved.utilitiesNote, legal_status_note: saved.legalStatusNote },
      });
      return toRealEstateListingTranslationView(saved, listing);
    }

    if (dto.expected_content_version == null) {
      throw new BadRequestException('Thiếu expected_content_version — tải lại bản dịch hiện tại trước khi lưu tiếp');
    }
    const patch: Partial<RealEstateListingTranslation> = {
      title: dto.title ?? null,
      description: dto.description ?? null,
      utilitiesNote: dto.utilities_note ?? null,
      legalStatusNote: dto.legal_status_note ?? null,
      sourceContentHash: newHash,
    };
    if (DRAFT_REVIEW_STATUSES.has(existing.status)) {
      patch.status = RealEstateListingTranslationStatus.DRAFT;
      patch.reviewNote = null;
      patch.reviewerId = null;
      patch.reviewedAt = null;
    }
    const ok = await this.translationsRepo.updateWithCas(existing.id, patch, dto.expected_content_version);
    if (!ok) {
      throw new ConflictException(
        `Bản dịch vừa được sửa hoặc duyệt bởi người khác (mong đợi content_version=${dto.expected_content_version}) — tải lại và thử lại.`,
      );
    }
    Object.assign(existing, patch, { contentVersion: dto.expected_content_version + 1 });
    await this.audit.record({
      event: 'real_estate_listing_translation.saved',
      entityType: 'real_estate_listing_translation',
      entityId: existing.id,
      actorId: userId,
      after: { title: existing.title, description: existing.description, utilities_note: existing.utilitiesNote, legal_status_note: existing.legalStatusNote },
    });
    return toRealEstateListingTranslationView(existing, listing);
  }

  async submit(realEstateListingId: string, userId: string) {
    const listing = await this.loadOwnedListing(realEstateListingId, userId);
    const translation = await this.translationsRepo.findByRealEstateListingId(realEstateListingId);
    if (!translation) throw new NotFoundException('Chưa có bản dịch nào — lưu nội dung trước khi gửi duyệt');
    if (
      translation.status !== RealEstateListingTranslationStatus.DRAFT &&
      translation.status !== RealEstateListingTranslationStatus.REJECTED
    ) {
      throw new ConflictException(`Không thể gửi duyệt bản dịch từ trạng thái "${translation.status}"`);
    }
    if (!translation.title || !translation.description) {
      throw new BadRequestException('Bản dịch cần có ít nhất tiêu đề và mô tả trước khi gửi duyệt');
    }
    const patch: Partial<RealEstateListingTranslation> = {
      status: RealEstateListingTranslationStatus.PENDING,
      reviewNote: null,
      reviewerId: null,
      reviewedAt: null,
    };
    const ok = await this.translationsRepo.updateWithCas(translation.id, patch, translation.contentVersion);
    if (!ok) throw new ConflictException('Bản dịch vừa được sửa bởi người khác — tải lại và thử lại.');
    Object.assign(translation, patch, { contentVersion: translation.contentVersion + 1 });
    await this.audit.record({
      event: 'real_estate_listing_translation.submitted',
      entityType: 'real_estate_listing_translation',
      entityId: translation.id,
      actorId: userId,
    });
    return toRealEstateListingTranslationView(translation, listing);
  }

  async decide(realEstateListingId: string, dto: DecideRealEstateListingTranslationDto, moderatorId: string) {
    const translation = await this.translationsRepo.findByRealEstateListingId(realEstateListingId);
    if (!translation) throw new NotFoundException('Không tìm thấy bản dịch');
    if (translation.status !== RealEstateListingTranslationStatus.PENDING) {
      throw new ConflictException(`Không thể duyệt bản dịch từ trạng thái "${translation.status}"`);
    }
    if (dto.expected_content_version == null) {
      throw new BadRequestException('Thiếu expected_content_version — tải lại hàng chờ duyệt trước khi quyết định');
    }
    const listing = await this.listingsRepo.findById(realEstateListingId);
    const isApprove = dto.decision === 'approve';
    const patch: Partial<RealEstateListingTranslation> = {
      reviewerId: moderatorId,
      reviewedAt: new Date(),
      reviewNote: dto.note ?? null,
      status: isApprove ? RealEstateListingTranslationStatus.PUBLISHED : RealEstateListingTranslationStatus.REJECTED,
    };
    if (isApprove) {
      patch.publishedTitle = translation.title;
      patch.publishedDescription = translation.description;
      patch.publishedUtilitiesNote = translation.utilitiesNote;
      patch.publishedLegalStatusNote = translation.legalStatusNote;
      patch.publishedSourceContentHash = listing ? computeRealEstateListingSourceHash(listing) : translation.sourceContentHash;
      patch.publishedAt = new Date();
    }
    const ok = await this.translationsRepo.updateWithCas(translation.id, patch, dto.expected_content_version);
    if (!ok) {
      throw new ConflictException(
        `Bản dịch vừa bị sửa hoặc duyệt bởi người khác (mong đợi content_version=${dto.expected_content_version}) — tải lại và thử lại.`,
      );
    }
    Object.assign(translation, patch, { contentVersion: dto.expected_content_version + 1 });
    await this.audit.record({
      event: isApprove ? 'real_estate_listing_translation.approved' : 'real_estate_listing_translation.rejected',
      entityType: 'real_estate_listing_translation',
      entityId: translation.id,
      actorId: moderatorId,
      after: isApprove
        ? { title: patch.publishedTitle, description: patch.publishedDescription, utilities_note: patch.publishedUtilitiesNote, legal_status_note: patch.publishedLegalStatusNote }
        : { review_note: patch.reviewNote },
    });
    return toRealEstateListingTranslationView(translation, listing ?? undefined);
  }

  async listPending() {
    const rows = await this.translationsRepo.listPending();
    const views = await Promise.all(
      rows.map(async (row) => {
        const listing = await this.listingsRepo.findById(row.realEstateListingId);
        return listing ? toRealEstateListingTranslationModeratorView(row, listing) : null;
      }),
    );
    return views.filter((v): v is NonNullable<typeof v> => v !== null);
  }
}
