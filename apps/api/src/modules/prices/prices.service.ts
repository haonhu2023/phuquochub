import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PricesRepository } from './repositories/prices.repository';
import { PriceHistory } from './entities/price-history.entity';
import { CreatePriceDto, UpdatePriceDto } from './dto/prices.dto';
import { canDisclosePrice } from '../../common/price-trust';
import { AuditService } from '../../core/audit/audit.service';

// Discriminator lowercase snake_case (data-dictionary B-3). Đồng bộ với wiki_revisions ('place').
const ENTITY_PLACE = 'place';

@Injectable()
export class PricesService {
  constructor(
    private readonly repo: PricesRepository,
    private readonly audit: AuditService,
  ) {}

  // Public Beta price trust gate (2026-08-28): `GET /places/:id/prices` là `@Public()` — trước
  // đây trả nguyên `amount` bất kể `verification_status`, kể cả với `?history=true` (phơi CẢ
  // những bản giá đã bị từ chối/hết hạn). `toResponse(p, { publicResponse: true })` redact
  // `amount` cho từng dòng theo ĐÚNG verification_status của chính dòng đó.
  async listByPlace(placeId: string, history: boolean) {
    const rows = history
      ? await this.repo.listByEntity(ENTITY_PLACE, placeId)
      : await this.repo.current(ENTITY_PLACE, placeId);
    return rows.map((p) => this.toResponse(p, { publicResponse: true }));
  }

  // `actorId` TUỲ CHỌN (2026-09-16, ADR-016 audit hardening) — cùng chủ trương ContactsService.
  // Giá chỉ dùng giá công khai, có nguồn (`sourceId`) và thời gian hiệu lực (`validFrom`/`validTo`)
  // — cả hai đã BẮT BUỘC có sẵn trên entity/DTO; không có cột "giá B2B/nội bộ" nào tồn tại để lộ,
  // nên không cần logic loại trừ nào thêm ở đây.
  async createForPlace(placeId: string, dto: CreatePriceDto, actorId: string | null = null) {
    // Append-only: luôn thêm bản mới (không ghi đè) — ADR-006.
    const price = this.repo.create({
      entityType: ENTITY_PLACE,
      entityId: placeId,
      serviceName: dto.service_name,
      amount: String(dto.amount),
      currency: dto.currency ?? 'VND',
      unit: dto.unit ?? null,
      isFree: dto.is_free ?? false,
      description: dto.description ?? null,
      validFrom: dto.valid_from ? new Date(dto.valid_from) : null,
      validTo: dto.valid_to ? new Date(dto.valid_to) : null,
      displayOrder: dto.display_order ?? 0,
      updatedBy: actorId,
    });
    const saved = await this.repo.save(price);
    await this.audit.record({
      event: 'price.created',
      entityType: 'price',
      entityId: saved.id,
      actorId,
      permission: 'Price.Edit.Managed',
      context: { place_id: placeId, service_name: saved.serviceName },
    });
    return this.toResponse(saved);
  }

  /** CAS — cùng khuôn ContactsService.update() (dto.expected_version tuỳ chọn, KHÔNG PHẢI timestamp). */
  async update(id: string, dto: UpdatePriceDto, actorId: string | null = null) {
    const price = await this.repo.findById(id);
    if (!price) {
      throw new NotFoundException('Không tìm thấy bản giá');
    }
    const before = this.toResponse(price);
    const patch: Record<string, unknown> = {};
    if (dto.service_name !== undefined) patch.serviceName = dto.service_name;
    if (dto.amount !== undefined) patch.amount = String(dto.amount);
    if (dto.unit !== undefined) patch.unit = dto.unit;
    if (dto.is_free !== undefined) patch.isFree = dto.is_free;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.valid_to !== undefined) patch.validTo = new Date(dto.valid_to);
    if (dto.display_order !== undefined) patch.displayOrder = dto.display_order;

    if (dto.expected_version) {
      const applied = await this.repo.updateScalarsIfUnchanged(id, patch, dto.expected_version);
      if (!applied) {
        throw new ConflictException('Bản giá đã được người khác cập nhật — tải lại và thử lại.');
      }
    } else {
      Object.assign(price, patch);
      await this.repo.save(price);
    }

    const updated = await this.repo.findById(id);
    await this.audit.record({
      event: 'price.updated',
      entityType: 'price',
      entityId: id,
      actorId,
      permission: 'Price.Edit.Managed',
      before,
      after: this.toResponse(updated!),
    });
    return this.toResponse(updated!);
  }

  // `publicResponse` mặc định false: `createForPlace`/`update` phản ánh lại CHÍNH bản ghi actor
  // (đặc quyền) vừa gửi/sửa — actor phải thấy đúng giá trị họ vừa nhập, không phải một stranger
  // đọc public API, nên KHÔNG redact ở hai đường đó. Chỉ `listByPlace` (public) truyền `true`.
  private toResponse(p: PriceHistory, opts: { publicResponse?: boolean } = {}) {
    const redact = (opts.publicResponse ?? false) && !canDisclosePrice(p.verificationStatus);
    return {
      id: p.id,
      service_name: p.serviceName,
      amount: redact ? null : Number(p.amount),
      currency: p.currency,
      unit: p.unit,
      is_free: p.isFree,
      valid_from: p.validFrom,
      valid_to: p.validTo,
      verification_status: p.verificationStatus,
    };
  }
}
