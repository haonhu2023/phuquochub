import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { JobListingTranslationsRepository } from './repositories/job-listing-translations.repository';
import { JobListingsRepository } from './repositories/job-listings.repository';
import { JobListing } from './entities/job-listing.entity';
import { JobListingTranslationStatus } from './job-listings.enums';
import { DecideJobListingTranslationDto, UpsertJobListingTranslationDto } from './dto/job-listing-translations.dto';
import { toJobListingTranslationModeratorView, toJobListingTranslationView } from './job-listing-translations.mapper';
import { computeJobListingSourceHash } from './job-listing-translation-hash';

// Gói C phần 1/2 (17/10/2026) — bản dịch tiếng Anh cho job_listings, vòng đời RIÊNG (xem
// job-listing-translations.enums), ĐỘC LẬP hoàn toàn với JobListingsService's vòng đời chính (một
// tin published tiếng Việt có thể có bản dịch draft/pending/rejected, và ngược lại — không bên nào
// kéo bên kia). Tái dùng NGUYÊN TẮC moderation hiện có (owner-only viết, JobListing.Moderate duyệt
// — CÙNG permission, KHÔNG permission mới) nhưng KHÔNG tái dùng bảng/CODE của place_translations
// (xem migration InitJobListingTranslations's ghi chú đầy đủ về lý do).
@Injectable()
export class JobListingTranslationsService {
  constructor(
    private readonly translationsRepo: JobListingTranslationsRepository,
    private readonly listingsRepo: JobListingsRepository,
  ) {}

  private async loadOwnedListing(jobListingId: string, userId: string): Promise<JobListing> {
    const row = await this.listingsRepo.findById(jobListingId);
    if (!row || row.createdBy !== userId) throw new NotFoundException('Không tìm thấy tin tuyển dụng');
    return row;
  }

  // `null` nếu chủ tin chưa từng bắt đầu dịch — KHÔNG tự tạo một bản dịch rỗng chỉ vì được đọc tới
  // (khác convention "luôn tồn tại" của place_translations — ở đây một dòng chỉ xuất hiện khi chủ
  // tin chủ động lưu ít nhất một lần).
  async getMine(jobListingId: string, userId: string) {
    const listing = await this.loadOwnedListing(jobListingId, userId);
    const translation = await this.translationsRepo.findByJobListingId(jobListingId);
    return translation ? toJobListingTranslationView(translation, listing) : null;
  }

  // Lưu DRAFT — owner-only. Luôn UPDATE TẠI CHỖ (không revision history, xem migration). Nếu đang
  // published/rejected, sửa rút về draft (CÙNG nguyên tắc JobListingsService.update(): một bản dịch
  // published không được ngầm đổi nội dung mà vẫn hiện công khai — phải qua duyệt lại).
  async save(jobListingId: string, dto: UpsertJobListingTranslationDto, userId: string) {
    const listing = await this.loadOwnedListing(jobListingId, userId);
    let translation = await this.translationsRepo.findByJobListingId(jobListingId);
    if (!translation) translation = this.translationsRepo.create(jobListingId);

    translation.title = dto.title ?? null;
    translation.description = dto.description ?? null;
    translation.requirements = dto.requirements ?? null;
    translation.benefits = dto.benefits ?? null;
    translation.sourceContentHash = computeJobListingSourceHash(listing);

    if (
      translation.status === JobListingTranslationStatus.PUBLISHED ||
      translation.status === JobListingTranslationStatus.REJECTED
    ) {
      translation.status = JobListingTranslationStatus.DRAFT;
      translation.reviewNote = null;
      translation.reviewerId = null;
      translation.reviewedAt = null;
    }
    const saved = await this.translationsRepo.save(translation);
    return toJobListingTranslationView(saved, listing);
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
    // Yêu cầu tối thiểu — bản dịch thiếu tiêu đề/mô tả thì không đủ để hiện trang chi tiết công
    // khai một cách có ý nghĩa (requirements/benefits vẫn tuỳ chọn, cùng quy tắc bản gốc).
    if (!translation.title || !translation.description) {
      throw new BadRequestException('Bản dịch cần có ít nhất tiêu đề và mô tả trước khi gửi duyệt');
    }
    translation.status = JobListingTranslationStatus.PENDING;
    translation.reviewNote = null;
    translation.reviewerId = null;
    translation.reviewedAt = null;
    const saved = await this.translationsRepo.save(translation);
    return toJobListingTranslationView(saved, listing);
  }

  // Quyền duyệt kiểm Ở CONTROLLER (@RequirePermissions('JobListing.Moderate') — permission ĐÃ CÓ,
  // không mới) — khác close()/reopen() của JobListingsService (sở hữu-hoặc-moderator, phải kiểm
  // tại service vì phụ thuộc bản ghi). Duyệt bản dịch không có khái niệm "chủ sở hữu được tự duyệt
  // của mình" nào khác — luôn cần JobListing.Moderate, tĩnh, khai được ở controller.
  async decide(jobListingId: string, dto: DecideJobListingTranslationDto, moderatorId: string) {
    const translation = await this.translationsRepo.findByJobListingId(jobListingId);
    if (!translation) throw new NotFoundException('Không tìm thấy bản dịch');
    if (translation.status !== JobListingTranslationStatus.PENDING) {
      throw new ConflictException(`Không thể duyệt bản dịch từ trạng thái "${translation.status}"`);
    }
    const listing = await this.listingsRepo.findById(jobListingId);
    translation.reviewerId = moderatorId;
    translation.reviewedAt = new Date();
    translation.reviewNote = dto.note ?? null;
    translation.status = dto.decision === 'approve' ? JobListingTranslationStatus.PUBLISHED : JobListingTranslationStatus.REJECTED;
    const saved = await this.translationsRepo.save(translation);
    return toJobListingTranslationView(saved, listing ?? undefined);
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
