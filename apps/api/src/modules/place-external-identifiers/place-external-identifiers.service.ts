import { BadRequestException, Injectable } from '@nestjs/common';
import { PlaceExternalIdentifiersRepository } from './repositories/place-external-identifiers.repository';
import { PlaceExternalIdentifier } from './entities/place-external-identifier.entity';
import { PlaceExternalIdentifierProvider } from './place-external-identifiers.enums';

export interface EnsureIdentifierInput {
  placeId: string;
  provider: PlaceExternalIdentifierProvider;
  externalId: string;
  isPrimary?: boolean;
  sourceId?: string | null;
  evidenceId?: string | null;
  verifiedAt?: Date | null;
}

export interface UpsertPrimaryGooglePlaceIdInput {
  placeId: string;
  externalId: string;
  sourceId?: string | null;
  evidenceId?: string | null;
}

// Idempotent theo (provider, external_id) — cùng nguyên tắc VerifiedFactsIngestionService.ensureSource
// (dedupe theo type+externalRef): gọi lại với đúng place + đúng identifier là no-op, không tạo hàng
// thứ hai. Gọi với CÙNG identifier nhưng KHÁC place bị từ chối — một Google Place ID không được gán
// cho hai place khác nhau trong CSDL này (xung đột danh tính, không phải điều kiện im lặng bỏ qua).
@Injectable()
export class PlaceExternalIdentifiersService {
  constructor(private readonly repo: PlaceExternalIdentifiersRepository) {}

  async ensureIdentifier(input: EnsureIdentifierInput): Promise<PlaceExternalIdentifier> {
    const existing = await this.repo.findByProviderAndExternalId(input.provider, input.externalId);
    if (existing) {
      if (existing.placeId !== input.placeId) {
        throw new BadRequestException(
          `${input.provider} identifier "${input.externalId}" is already mapped to place ${existing.placeId}; ` +
            `refusing to also map it to ${input.placeId}. Resolve the identity conflict before retrying.`,
        );
      }
      return existing; // idempotent no-op — same place, same provider, same external id
    }

    const row = this.repo.create({
      placeId: input.placeId,
      provider: input.provider,
      externalId: input.externalId,
      isPrimary: input.isPrimary ?? true,
      sourceId: input.sourceId ?? null,
      evidenceId: input.evidenceId ?? null,
      verifiedAt: input.verifiedAt ?? null,
    });
    return this.repo.save(row);
  }

  listByPlace(placeId: string): Promise<PlaceExternalIdentifier[]> {
    return this.repo.listByPlace(placeId);
  }

  // Đường ghi RIÊNG cho dashboard (PlaceExternalIdentifiersController) — KHÁC ensureIdentifier() ở
  // trên. `ensureIdentifier` chỉ dedupe theo (provider, external_id); nó KHÔNG biết place này đã có
  // sẵn một identifier GOOGLE_PLACES hàng khác (place_id+provider không có ràng buộc UNIQUE ở
  // schema) — gọi lại ensureIdentifier với một external_id MỚI cho cùng place sẽ chèn THÊM một
  // hàng thứ hai thay vì thay thế, phá bất biến "1 Google Place ID chính/place" mà dashboard cần
  // (sửa nhầm ID → nhập lại). Hàm này giữ đúng bất biến đó: cùng giá trị → no-op (idempotent, như
  // ensureIdentifier); khác giá trị nhưng CÙNG place → UPDATE tại chỗ hàng đã có (không insert
  // hàng mới), và verifiedAt bị reset về null vì xác minh cũ (nếu có) gắn với ID CŨ, không tự động
  // áp dụng cho ID mới; khác giá trị và external_id đó đã thuộc place KHÁC → từ chối (cùng thông
  // điệp xung đột danh tính như ensureIdentifier).
  async upsertPrimaryGooglePlaceId(input: UpsertPrimaryGooglePlaceIdInput): Promise<PlaceExternalIdentifier> {
    const existingForPlace = await this.repo.findByPlaceAndProvider(
      input.placeId,
      PlaceExternalIdentifierProvider.GOOGLE_PLACES,
    );
    if (existingForPlace && existingForPlace.externalId === input.externalId) {
      return existingForPlace; // idempotent no-op — same place, same id, save-again
    }

    const claimedElsewhere = await this.repo.findByProviderAndExternalId(
      PlaceExternalIdentifierProvider.GOOGLE_PLACES,
      input.externalId,
    );
    if (claimedElsewhere && claimedElsewhere.placeId !== input.placeId) {
      throw new BadRequestException(
        `GOOGLE_PLACES identifier "${input.externalId}" is already mapped to place ${claimedElsewhere.placeId}; ` +
          `refusing to also map it to ${input.placeId}. Resolve the identity conflict before retrying.`,
      );
    }

    if (existingForPlace) {
      existingForPlace.externalId = input.externalId;
      existingForPlace.sourceId = input.sourceId ?? null;
      existingForPlace.evidenceId = input.evidenceId ?? null;
      existingForPlace.verifiedAt = null;
      return this.repo.save(existingForPlace);
    }

    const row = this.repo.create({
      placeId: input.placeId,
      provider: PlaceExternalIdentifierProvider.GOOGLE_PLACES,
      externalId: input.externalId,
      isPrimary: true,
      sourceId: input.sourceId ?? null,
      evidenceId: input.evidenceId ?? null,
      verifiedAt: null,
    });
    return this.repo.save(row);
  }

  // Quy tắc "đủ điều kiện công khai" (chốt 2026-10-16, gói external-identifiers): CHỈ identifier có
  // `verifiedAt` KHÔNG null và `isPrimary` được dùng để build link "hồ sơ đã xác nhận" công khai
  // (xem PlacesService.buildDetailResponse, apps/web mapLinks.ts's nhánh `primaryCertain: true`).
  // `ensureIdentifier` ở trên KHÔNG BAO GIỜ nhận verifiedAt từ client (route viết trong
  // PlaceExternalIdentifiersController luôn truyền `null`) — nên MỘT ĐỊNH NGHĨA DUY NHẤT "đủ điều
  // kiện" nằm ở ĐÂY, không rải rác điều kiện lọc ở nhiều caller. Ai/cơ chế nào được phép SET
  // verifiedAt (đánh dấu đã xác minh) CHƯA được quyết định — cố ý CHƯA có action nào trong service
  // này làm việc đó; bất kỳ identifier nào tồn tại hôm nay (nhập qua dashboard) có verifiedAt=null
  // nên sẽ KHÔNG đi qua đường này cho tới khi quyết định đó được đưa ra và một cơ chế xác minh
  // riêng (ngoài phạm vi gói này) ghi verifiedAt.
  async findVerifiedPrimaryGooglePlaceId(placeId: string): Promise<string | null> {
    const row = await this.repo.findByPlaceAndProvider(placeId, PlaceExternalIdentifierProvider.GOOGLE_PLACES);
    if (!row || !row.isPrimary || row.verifiedAt === null) return null;
    return row.externalId;
  }

  toResponse(row: PlaceExternalIdentifier) {
    return {
      id: row.id,
      place_id: row.placeId,
      provider: row.provider,
      external_id: row.externalId,
      is_primary: row.isPrimary,
      source_id: row.sourceId,
      evidence_id: row.evidenceId,
      verified_at: row.verifiedAt ? row.verifiedAt.toISOString() : null,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }
}
