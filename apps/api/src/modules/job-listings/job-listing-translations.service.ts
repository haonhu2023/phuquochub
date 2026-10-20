import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { applyRichTextField, RichTextFieldAccessors } from '../../common/rich-text-field';
import { AuditService } from '../../core/audit/audit.service';
import { JobListingTranslationsRepository } from './repositories/job-listing-translations.repository';
import { JobListingsRepository } from './repositories/job-listings.repository';
import { JobListing } from './entities/job-listing.entity';
import { JobListingTranslation } from './entities/job-listing-translation.entity';
import { JobListingTranslationStatus } from './job-listings.enums';
import { DecideJobListingTranslationDto, UpsertJobListingTranslationDto } from './dto/job-listing-translations.dto';
import { toJobListingTranslationModeratorView, toJobListingTranslationView } from './job-listing-translations.mapper';
import { computeJobListingCriticalFieldsHash, computeJobListingSourceHash } from './job-listing-translation-hash';

const DRAFT_REVIEW_STATUSES = new Set([
  JobListingTranslationStatus.PUBLISHED,
  JobListingTranslationStatus.REJECTED,
  JobListingTranslationStatus.PENDING,
]);

// Gói C phần 1/2 (17/10/2026, thiết kế lại sau phản hồi owner) — bản dịch tiếng Anh cho
// job_listings. Vòng đời RIÊNG, ĐỘC LẬP hoàn toàn với JobListingsService's vòng đời chính. Tái
// dùng NGUYÊN quyền hiện có (`JobListing.Create`/`JobListing.Moderate` — không permission mới) và
// `AuditService` hiện có (không xây audit trail riêng) — nhưng KHÔNG tái dùng bảng/code của
// place_translations (xem migration's ghi chú đầy đủ về lý do).
//
// Bất biến quan trọng nhất của thiết kế này: `save()`/`submit()` CHỈ đụng vùng NHÁP
// (title/description/requirements/benefits/sourceContentHash) — KHÔNG BAO GIỜ đụng vùng ĐÃ DUYỆT
// (published*). Nghĩa là sửa/gửi duyệt lại một bản dịch ĐANG công khai KHÔNG làm mất nội dung đang
// hiện cho người đọc — nội dung đó chỉ đổi khi `decide()` approve một bản MỚI.
@Injectable()
export class JobListingTranslationsService {
  constructor(
    private readonly translationsRepo: JobListingTranslationsRepository,
    private readonly listingsRepo: JobListingsRepository,
    private readonly audit: AuditService,
  ) {}

  // Gói D — vùng NHÁP dùng CHUNG quy tắc nguồn-sự-thật + hash chống rollback với job_listings
  // (apps/api/src/common/rich-text-field.ts). Vùng ĐÃ DUYỆT (published*) KHÔNG dùng accessor này —
  // đó là một snapshot COPY trực tiếp từ nháp lúc approve (xem decide()), không phải một write mới.
  private static readonly DRAFT_DESCRIPTION_ACCESSORS: RichTextFieldAccessors<JobListingTranslation> = {
    setPlain: (e, v) => (e.description = v),
    getRich: (e) => e.descriptionRich,
    setRich: (e, v) => (e.descriptionRich = v),
    setRichHash: (e, v) => (e.descriptionRichHash = v),
  };

  private async loadOwnedListing(jobListingId: string, userId: string): Promise<JobListing> {
    const row = await this.listingsRepo.findById(jobListingId);
    if (!row || row.createdBy !== userId) throw new NotFoundException('Không tìm thấy tin tuyển dụng');
    return row;
  }

  // `null` nếu chủ tin chưa từng bắt đầu dịch — KHÔNG tự tạo một bản dịch rỗng chỉ vì được đọc tới.
  async getMine(jobListingId: string, userId: string) {
    const listing = await this.loadOwnedListing(jobListingId, userId);
    const translation = await this.translationsRepo.findByJobListingId(jobListingId);
    return translation ? toJobListingTranslationView(translation, listing) : null;
  }

  // Lưu DRAFT — owner-only, CAS bắt buộc khi đã có bản dịch (xem DTO's ghi chú). CHỈ ghi vùng
  // nháp — published* không đổi (xem ghi chú đầu file).
  async save(jobListingId: string, dto: UpsertJobListingTranslationDto, userId: string) {
    const listing = await this.loadOwnedListing(jobListingId, userId);
    const existing = await this.translationsRepo.findByJobListingId(jobListingId);
    const newHash = computeJobListingSourceHash(listing);

    if (!existing) {
      const entity = this.translationsRepo.create(jobListingId);
      entity.title = dto.title ?? null;
      applyRichTextField(entity, JobListingTranslationsService.DRAFT_DESCRIPTION_ACCESSORS, dto.description_rich, dto.description, 'description_rich');
      entity.requirements = dto.requirements ?? null;
      entity.benefits = dto.benefits ?? null;
      entity.sourceContentHash = newHash;
      const saved = await this.translationsRepo.insertNew(entity);
      await this.audit.record({
        event: 'job_listing_translation.saved',
        entityType: 'job_listing_translation',
        entityId: saved.id,
        actorId: userId,
        after: { title: saved.title, description: saved.description, requirements: saved.requirements, benefits: saved.benefits },
      });
      return toJobListingTranslationView(saved, listing);
    }

    if (dto.expected_content_version == null) {
      throw new BadRequestException('Thiếu expected_content_version — tải lại bản dịch hiện tại trước khi lưu tiếp');
    }
    // Áp quy tắc rich-text TRƯỚC khi gom patch — applyRichTextField() đọc `existing.descriptionRich`
    // hiện tại để quyết định demote hay giữ nguyên (xem ghi chú hàm), nên phải chạy trên `existing`
    // (entity đã tải), không phải một entity rỗng.
    applyRichTextField(existing, JobListingTranslationsService.DRAFT_DESCRIPTION_ACCESSORS, dto.description_rich, dto.description, 'description_rich');
    const patch: Partial<JobListingTranslation> = {
      title: dto.title ?? null,
      description: existing.description,
      descriptionRich: existing.descriptionRich,
      descriptionRichHash: existing.descriptionRichHash,
      requirements: dto.requirements ?? null,
      benefits: dto.benefits ?? null,
      sourceContentHash: newHash,
    };
    // Sửa trong lúc pending/published/rejected rút NHÁP về draft (CÙNG nguyên tắc
    // JobListingsService.update(): một bản dịch published không được ngầm đổi nội dung đang hiện —
    // nhưng ở đây "nội dung đang hiện" là published*, KHÔNG BỊ ĐỘNG TỚI, nên an toàn tuyệt đối).
    if (DRAFT_REVIEW_STATUSES.has(existing.status)) {
      patch.status = JobListingTranslationStatus.DRAFT;
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
      event: 'job_listing_translation.saved',
      entityType: 'job_listing_translation',
      entityId: existing.id,
      actorId: userId,
      after: { title: existing.title, description: existing.description, requirements: existing.requirements, benefits: existing.benefits },
    });
    return toJobListingTranslationView(existing, listing);
  }

  async submit(jobListingId: string, userId: string) {
    const listing = await this.loadOwnedListing(jobListingId, userId);
    const translation = await this.translationsRepo.findByJobListingId(jobListingId);
    if (!translation) throw new NotFoundException('Chưa có bản dịch nào — lưu nội dung trước khi gửi duyệt');
    if (
      translation.status !== JobListingTranslationStatus.DRAFT &&
      translation.status !== JobListingTranslationStatus.REJECTED
    ) {
      throw new ConflictException(`Không thể gửi duyệt bản dịch từ trạng thái "${translation.status}"`);
    }
    if (!translation.title || !translation.description) {
      throw new BadRequestException('Bản dịch cần có ít nhất tiêu đề và mô tả trước khi gửi duyệt');
    }
    const patch: Partial<JobListingTranslation> = {
      status: JobListingTranslationStatus.PENDING,
      reviewNote: null,
      reviewerId: null,
      reviewedAt: null,
    };
    const ok = await this.translationsRepo.updateWithCas(translation.id, patch, translation.contentVersion);
    if (!ok) {
      throw new ConflictException('Bản dịch vừa được sửa bởi người khác — tải lại và thử lại.');
    }
    Object.assign(translation, patch, { contentVersion: translation.contentVersion + 1 });
    await this.audit.record({
      event: 'job_listing_translation.submitted',
      entityType: 'job_listing_translation',
      entityId: translation.id,
      actorId: userId,
    });
    return toJobListingTranslationView(translation, listing);
  }

  // Quyền duyệt kiểm Ở CONTROLLER (@RequirePermissions('JobListing.Moderate') — permission ĐÃ CÓ).
  // CAS bắt buộc (owner: "Moderator phải duyệt đúng phiên bản đã đọc") — kiểm Ở ĐÂY (không phải
  // DTO) để lỗi "thiếu" là 400 rõ nghĩa, không lẫn với lỗi validation chung.
  async decide(jobListingId: string, dto: DecideJobListingTranslationDto, moderatorId: string) {
    const translation = await this.translationsRepo.findByJobListingId(jobListingId);
    if (!translation) throw new NotFoundException('Không tìm thấy bản dịch');
    if (translation.status !== JobListingTranslationStatus.PENDING) {
      throw new ConflictException(`Không thể duyệt bản dịch từ trạng thái "${translation.status}"`);
    }
    if (dto.expected_content_version == null) {
      throw new BadRequestException('Thiếu expected_content_version — tải lại hàng chờ duyệt trước khi quyết định');
    }
    const listing = await this.listingsRepo.findById(jobListingId);
    const isApprove = dto.decision === 'approve';
    const patch: Partial<JobListingTranslation> = {
      reviewerId: moderatorId,
      reviewedAt: new Date(),
      reviewNote: dto.note ?? null,
      status: isApprove ? JobListingTranslationStatus.PUBLISHED : JobListingTranslationStatus.REJECTED,
    };
    if (isApprove) {
      // Chụp nhanh ĐÚNG nội dung nháp VỪA được duyệt vào vùng công khai — đây là lần DUY NHẤT
      // published* thay đổi (xem ghi chú đầu file).
      patch.publishedTitle = translation.title;
      patch.publishedDescription = translation.description;
      // Snapshot COPY trực tiếp từ nháp (KHÔNG qua applyRichTextField — đây không phải một write từ
      // DTO, là "chốt lại đúng nháp đang có" lúc duyệt, xem ghi chú đầu file). Copy CẢ hash: hash của
      // published area đo so với published area's plain, không phải tính lại — copy nguyên cặp giữ
      // đúng bất biến "hash luôn khớp plain cùng vùng tại thời điểm ghi".
      patch.publishedDescriptionRich = translation.descriptionRich;
      patch.publishedDescriptionRichHash = translation.descriptionRichHash;
      patch.publishedRequirements = translation.requirements;
      patch.publishedBenefits = translation.benefits;
      patch.publishedSourceContentHash = listing ? computeJobListingSourceHash(listing) : translation.sourceContentHash;
      // Gói D điểm 4 — chụp CẢ hash hẹp "dữ kiện quan trọng" tại đúng thời điểm duyệt (xem
      // job-listing-translation-hash.ts's criticalFields()) — dùng để sau này phát hiện CHÍNH XÁC
      // khi nào cần ẩn/fallback bản dịch thay vì chỉ cảnh báo chung.
      patch.publishedCriticalFieldsHash = listing ? computeJobListingCriticalFieldsHash(listing) : null;
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
      event: isApprove ? 'job_listing_translation.approved' : 'job_listing_translation.rejected',
      entityType: 'job_listing_translation',
      entityId: translation.id,
      actorId: moderatorId,
      // Ghi "after" ĐẦY ĐỦ khi approve — đây CHÍNH LÀ cách "không bỏ khả năng truy lại nội dung đã
      // được duyệt" (owner yêu cầu) mà KHÔNG xây một bảng lịch sử riêng (owner: "không cần sao chép
      // toàn bộ wiki_revisions") — audit_logs BẤT BIẾN đã là nơi lưu đúng mục đích này.
      after: isApprove
        ? { title: patch.publishedTitle, description: patch.publishedDescription, requirements: patch.publishedRequirements, benefits: patch.publishedBenefits }
        : { review_note: patch.reviewNote },
    });
    return toJobListingTranslationView(translation, listing ?? undefined);
  }

  // Hàng chờ duyệt bản dịch — quy mô nhỏ (một listing tối đa một bản dịch đang chờ), fetch từng
  // listing gốc để có ngữ cảnh (source_title) — KHÔNG cần batch/tránh N+1 cho quy mô này (khác
  // listAllForAdmin's findCreatorSummaries, nơi N có thể lớn hơn đáng kể).
  async listPending() {
    const rows = await this.translationsRepo.listPending();
    const views = await Promise.all(
      rows.map(async (row) => {
        const listing = await this.listingsRepo.findById(row.jobListingId);
        return listing ? toJobListingTranslationModeratorView(row, listing) : null;
      }),
    );
    return views.filter((v): v is NonNullable<typeof v> => v !== null);
  }
}
