import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { PlaceExternalIdentifiersRepository } from './repositories/place-external-identifiers.repository';
import { PlaceExternalIdentifier } from './entities/place-external-identifier.entity';
import { PlaceExternalIdentifierProvider } from './place-external-identifiers.enums';
import { AuditService } from '../../core/audit/audit.service';

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
  sourceId?: string;
  evidenceId?: string;
}

export interface ConfirmGooglePlaceIdInput {
  placeId: string;
  actorId: string;
  // BẮT BUỘC (2026-10-16, owner yêu cầu sau khi đọc lại luồng confirm/revoke) — external_id mà
  // người xác nhận ĐÃ ĐỌC và đối chiếu trên Google Maps trước khi bấm, KHÔNG phải "bất kỳ ID nào
  // đang là primary lúc request tới server". Không có field này, một race thật tồn tại: admin mở
  // trang, thấy ID X, mở hồ sơ Google của X để đối chiếu — đúng lúc đó người khác (hoặc chính họ ở
  // tab khác) sửa ID thành Y qua upsertPrimaryGooglePlaceId; admin bấm "Xác nhận" (vẫn tưởng đang
  // xác nhận X) → nếu server chỉ xác nhận "ID hiện tại", Y sẽ bị đánh dấu đã xác nhận dù CHƯA ai đối
  // chiếu nó. So khớp dưới ĐÂY, trong CÙNG advisory lock với chính thao tác đổi ID, đóng đúng race
  // đó — không chỉ là validate hình thức.
  expectedExternalId: string;
  sourceId?: string;
  evidenceId?: string;
}

export interface RevokeGooglePlaceIdVerificationInput {
  placeId: string;
  actorId: string;
  // Cùng lý do expectedExternalId ở ConfirmGooglePlaceIdInput — thu hồi cũng phải bám đúng ID đã
  // đọc, không thu hồi nhầm xác nhận của một ID đã bị thay bằng ID khác từ lúc đó.
  expectedExternalId: string;
}

// Lớp advisory lock riêng của module này (2) — KHÔNG trùng lớp 1 mà SourceFirstIngestService đã
// dùng cho pipeline nhập liệu (xem withCandidateLock ở đó). pg_advisory_xact_lock (không phải
// pg_advisory_lock trần) tự giải phóng khi transaction COMMIT/ROLLBACK — không cần try/finally
// unlock thủ công, không thể rò rỉ lock nếu có exception giữa chừng.
const ADVISORY_LOCK_CLASS = 2;

// Idempotent theo (provider, external_id) — cùng nguyên tắc VerifiedFactsIngestionService.ensureSource
// (dedupe theo type+externalRef): gọi lại với đúng place + đúng identifier là no-op, không tạo hàng
// thứ hai. Gọi với CÙNG identifier nhưng KHÁC place bị từ chối — một Google Place ID không được gán
// cho hai place khác nhau trong CSDL này (xung đột danh tính, không phải điều kiện im lặng bỏ qua).
// Từ khoá cho MỌI phương thức ghi của class này (ensureIdentifier/upsertPrimaryGooglePlaceId/
// confirm/revoke): tất cả đi qua CÙNG withPlaceProviderLock (class 2), nên không còn writer nào của
// bảng này (kể cả đường import cũ) đứng ngoài khoá — xem ghi chú đầy đủ ở ensureIdentifier.
@Injectable()
export class PlaceExternalIdentifiersService {
  constructor(
    private readonly repo: PlaceExternalIdentifiersRepository,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  // Khoá đúng một (placeId, provider) cho toàn bộ thời gian của `fn` — dùng cho MỌI thao tác ghi
  // trên sub-resource này (propose/confirm/revoke), không chỉ upsert. Lý do KHÔNG đủ nếu chỉ khoá
  // hàng đã có (`pessimistic_write`/FOR UPDATE, tiền lệ ở place-edit-proposals.repository.ts):
  // lần ghi ĐẦU TIÊN cho một (placeId, provider) chưa có hàng nào để khoá — hai request đồng thời
  // cùng thấy "chưa có hàng" rồi cùng INSERT sẽ tạo hai hàng is_primary=true mâu thuẫn, vì schema
  // không có UNIQUE(place_id, provider) (chỉ UNIQUE(provider, external_id)). Advisory lock (cùng
  // họ pg_advisory_lock mà SourceFirstIngestService.withCandidateLock đã dùng để chặn đúng loại
  // đua này khi tạo place) không cần hàng tồn tại trước để khoá — serializes cả nhánh "chưa có
  // hàng" lẫn nhánh "đã có hàng, sửa tại chỗ". Không cần migration thêm UNIQUE index.
  private async withPlaceProviderLock<T>(
    placeId: string,
    provider: PlaceExternalIdentifierProvider,
    fn: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [ADVISORY_LOCK_CLASS, `${placeId}:${provider}`]);
      return fn(manager);
    });
  }

  // Khoá CÙNG keyspace (class 2, (placeId, provider)) với upsertPrimaryGooglePlaceId/confirm/revoke
  // (2026-10-16, rà soát "mọi writer" theo yêu cầu owner). TRƯỚC khi sửa: hàm này chỉ khoá qua
  // SourceFirstIngestService.withCandidateLock (class 1, khoá theo candidateKey của job import) —
  // KHÁC hẳn keyspace mà dashboard dùng, nên hai đường ghi không hề loại trừ nhau dù cùng đụng một
  // (placeId, provider): một job import đang chạy VÀ một admin bấm confirm/upsert trên CÙNG place
  // tại CÙNG thời điểm có thể cùng đọc "chưa có hàng"/đọc xong rồi mới bị cái kia ghi đè. Đường đua
  // này là THẬT (không chỉ lý thuyết) — `registerExternalIds()` (source-first-ingest.service.ts)
  // gọi hàm này không qua class-2 lock nào, và không có gì ngăn hai lần kích hoạt job thủ công (hoặc
  // một job + một thao tác dashboard) chạy đồng thời trên cùng place — dù job tự nó xử lý TUẦN TỰ
  // bên trong (for-loop, không Promise.all). Khoá ở ĐÂY thay vì ở call site để MỌI caller tương lai
  // của ensureIdentifier (không chỉ ingest) tự động được bảo vệ, không cần tự nhớ bọc transaction.
  async ensureIdentifier(input: EnsureIdentifierInput): Promise<PlaceExternalIdentifier> {
    return this.withPlaceProviderLock(input.placeId, input.provider, async (manager) => {
      const existing = await this.repo.findByProviderAndExternalId(input.provider, input.externalId, manager);
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
      return this.repo.save(row, manager);
    });
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
    return this.withPlaceProviderLock(input.placeId, PlaceExternalIdentifierProvider.GOOGLE_PLACES, async (manager) => {
      const existingForPlace = await this.repo.findByPlaceAndProvider(
        input.placeId,
        PlaceExternalIdentifierProvider.GOOGLE_PLACES,
        manager,
      );

      // Lưu lại ĐÚNG ID hiện tại (chưa đổi) — hành vi RÕ: KHÔNG BAO GIỜ đụng verifiedAt (không vô
      // tình mất xác nhận đã có chỉ vì lưu lại), nhưng CÓ cập nhật source/evidence nếu người dùng
      // cung cấp mới (vd bổ sung bằng chứng cho một ID đã nhập, không cần đổi ID để làm việc đó).
      // Không có gì thay đổi thật → không ghi DB (true no-op, không chỉ "idempotent về mặt kết quả").
      if (existingForPlace && existingForPlace.externalId === input.externalId) {
        let changed = false;
        if (input.sourceId !== undefined && input.sourceId !== existingForPlace.sourceId) {
          existingForPlace.sourceId = input.sourceId;
          changed = true;
        }
        if (input.evidenceId !== undefined && input.evidenceId !== existingForPlace.evidenceId) {
          existingForPlace.evidenceId = input.evidenceId;
          changed = true;
        }
        return changed ? this.repo.save(existingForPlace, manager) : existingForPlace;
      }

      const claimedElsewhere = await this.repo.findByProviderAndExternalId(
        PlaceExternalIdentifierProvider.GOOGLE_PLACES,
        input.externalId,
        manager,
      );
      if (claimedElsewhere && claimedElsewhere.placeId !== input.placeId) {
        throw new BadRequestException(
          `GOOGLE_PLACES identifier "${input.externalId}" is already mapped to place ${claimedElsewhere.placeId}; ` +
            `refusing to also map it to ${input.placeId}. Resolve the identity conflict before retrying.`,
        );
      }

      if (existingForPlace) {
        // Đổi sang ID KHÁC cho CÙNG place — thay tại chỗ, KHÔNG mang source/evidence của ID CŨ sang
        // như thể bằng chứng đó vẫn hợp lệ cho ID mới (luôn lấy từ input, mặc định null nếu không
        // cung cấp — không kế thừa giá trị cũ). `verifiedAt` reset về null: xác nhận cũ gắn với ID
        // cũ, một ID khác CHƯA từng được ai đối chiếu, dù is_primary/row vẫn là CÙNG một hàng.
        existingForPlace.externalId = input.externalId;
        existingForPlace.sourceId = input.sourceId ?? null;
        existingForPlace.evidenceId = input.evidenceId ?? null;
        existingForPlace.verifiedAt = null;
        return this.repo.save(existingForPlace, manager);
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
      return this.repo.save(row, manager);
    });
  }

  // Xác nhận (2026-10-16) — hồ sơ Google khớp ĐÚNG địa điểm này. KHÔNG xác minh quyền sở hữu, chất
  // lượng cơ sở hay lối vào (xem ghi chú ở findVerifiedPrimaryGooglePlaceId) — chỉ một khẳng định
  // hẹp: "người có quyền đã đối chiếu, hồ sơ này đúng là địa điểm đó". Route gọi hàm này đòi
  // `PlaceExternalIdentifier.Verify` (KHÁC `Place.Edit.Managed` — xem migration
  // 1720009100000), không scoped theo place cụ thể (ai giữ quyền này xác nhận được MỌI place,
  // giống Place.Approve/Price.Verify). Mỗi lần gọi là MỘT hành động xác nhận thật (không chỉ kiểm
  // tra trạng thái) — `verifiedAt` LUÔN cập nhật thành "bây giờ" kể cả khi đã xác nhận từ trước
  // (đối chiếu lại định kỳ là hợp lệ), và actor/thời điểm LUÔN được ghi qua AuditService (cơ chế
  // audit đã có — KHÔNG thêm cột `verified_by` mới vào entity).
  async confirmGooglePlaceId(input: ConfirmGooglePlaceIdInput): Promise<PlaceExternalIdentifier> {
    return this.withPlaceProviderLock(input.placeId, PlaceExternalIdentifierProvider.GOOGLE_PLACES, async (manager) => {
      const existing = await this.repo.findByPlaceAndProvider(
        input.placeId,
        PlaceExternalIdentifierProvider.GOOGLE_PLACES,
        manager,
      );
      if (!existing) {
        throw new NotFoundException('Chưa có Google Place ID nào để xác nhận cho địa điểm này.');
      }
      if (existing.externalId !== input.expectedExternalId) {
        throw new ConflictException(
          `ID hiện tại ("${existing.externalId}") khác với ID bạn đã đối chiếu ("${input.expectedExternalId}") — ` +
            `có thể đã bị người khác sửa. Tải lại và đối chiếu lại trước khi xác nhận.`,
        );
      }
      const before = existing.verifiedAt;
      const confirmedAt = new Date();
      existing.verifiedAt = confirmedAt;
      if (input.sourceId !== undefined) existing.sourceId = input.sourceId;
      if (input.evidenceId !== undefined) existing.evidenceId = input.evidenceId;
      const saved = await this.repo.save(existing, manager);

      await this.audit.record({
        event: 'place_external_identifier.verified',
        entityType: 'place_external_identifier',
        entityId: saved.id,
        actorId: input.actorId,
        permission: 'PlaceExternalIdentifier.Verify',
        context: {
          place_id: input.placeId,
          provider: saved.provider,
          external_id: saved.externalId,
          from: before ? before.toISOString() : null,
          to: confirmedAt.toISOString(),
        },
      });
      return saved;
    });
  }

  // Thu hồi xác nhận (2026-10-16) — đối xứng với confirm, cùng permission. Không xoá identifier
  // (owner/manager vẫn có thể đã nhập đúng ID, chỉ là xác nhận đó không còn đúng/cần xem lại) —
  // chỉ đưa verifiedAt về null, trang công khai tự quay lại fallback tìm kiếm (findVerifiedPrimary
  // GooglePlaceId's quy tắc không đổi).
  async revokeGooglePlaceIdVerification(input: RevokeGooglePlaceIdVerificationInput): Promise<PlaceExternalIdentifier> {
    return this.withPlaceProviderLock(input.placeId, PlaceExternalIdentifierProvider.GOOGLE_PLACES, async (manager) => {
      const existing = await this.repo.findByPlaceAndProvider(
        input.placeId,
        PlaceExternalIdentifierProvider.GOOGLE_PLACES,
        manager,
      );
      if (!existing) {
        throw new NotFoundException('Chưa có Google Place ID nào cho địa điểm này.');
      }
      if (existing.externalId !== input.expectedExternalId) {
        throw new ConflictException(
          `ID hiện tại ("${existing.externalId}") khác với ID bạn đang thao tác ("${input.expectedExternalId}") — ` +
            `có thể đã bị người khác sửa. Tải lại trước khi thu hồi.`,
        );
      }
      const before = existing.verifiedAt;
      existing.verifiedAt = null;
      const saved = await this.repo.save(existing, manager);

      await this.audit.record({
        event: 'place_external_identifier.verification_revoked',
        entityType: 'place_external_identifier',
        entityId: saved.id,
        actorId: input.actorId,
        permission: 'PlaceExternalIdentifier.Verify',
        context: {
          place_id: input.placeId,
          provider: saved.provider,
          external_id: saved.externalId,
          from: before ? before.toISOString() : null,
          to: null,
        },
      });
      return saved;
    });
  }

  // Quy tắc "đủ điều kiện công khai" (chốt 2026-10-16, gói external-identifiers): CHỈ identifier có
  // `verifiedAt` KHÔNG null và `isPrimary` được dùng để build link "hồ sơ đã xác nhận" công khai
  // (xem PlacesService.buildDetailResponse, apps/web mapLinks.ts's nhánh `primaryCertain: true`).
  // `ensureIdentifier`/`upsertPrimaryGooglePlaceId` KHÔNG BAO GIỜ nhận verifiedAt từ client — nên
  // MỘT ĐỊNH NGHĨA DUY NHẤT "đủ điều kiện" nằm ở ĐÂY, không rải rác điều kiện lọc ở nhiều caller.
  // Cơ chế SET verifiedAt (2026-10-16, cùng ngày, phần hai của gói): `confirmGooglePlaceId()`/
  // `revokeGooglePlaceIdVerification()` bên dưới — đòi permission RIÊNG
  // `PlaceExternalIdentifier.Verify` (migration 1720009100000), tách khỏi `Place.Edit.Managed` mà
  // route nhập ID dùng. Tách quyền này bảo đảm "người CHỈ giữ Place.Edit.Managed không tự xác nhận
  // được" — KHÔNG bảo đảm "người nhập ID không bao giờ là người xác nhận" (content_owner giữ cả
  // hai permission, được phép tự làm cả hai bước ở MVP này — xem ghi chú đầy đủ ở
  // PlaceExternalIdentifiersController).
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
