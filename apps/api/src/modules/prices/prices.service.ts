import { Injectable, NotFoundException } from '@nestjs/common';
import { PricesRepository } from './repositories/prices.repository';
import { PriceHistory } from './entities/price-history.entity';
import { CreatePriceDto, UpdatePriceDto } from './dto/prices.dto';
import { canDisclosePrice } from '../../common/price-trust';

// Discriminator lowercase snake_case (data-dictionary B-3). Đồng bộ với wiki_revisions ('place').
const ENTITY_PLACE = 'place';

@Injectable()
export class PricesService {
  constructor(private readonly repo: PricesRepository) {}

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

  async createForPlace(placeId: string, dto: CreatePriceDto) {
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
    });
    return this.toResponse(await this.repo.save(price));
  }

  async update(id: string, dto: UpdatePriceDto) {
    const price = await this.repo.findById(id);
    if (!price) {
      throw new NotFoundException('Không tìm thấy bản giá');
    }
    if (dto.service_name !== undefined) price.serviceName = dto.service_name;
    if (dto.amount !== undefined) price.amount = String(dto.amount);
    if (dto.unit !== undefined) price.unit = dto.unit;
    if (dto.is_free !== undefined) price.isFree = dto.is_free;
    if (dto.description !== undefined) price.description = dto.description;
    if (dto.valid_to !== undefined) price.validTo = new Date(dto.valid_to);
    if (dto.display_order !== undefined) price.displayOrder = dto.display_order;
    return this.toResponse(await this.repo.save(price));
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
