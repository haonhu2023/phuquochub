import { Injectable, NotFoundException } from '@nestjs/common';
import { PricesRepository } from './repositories/prices.repository';
import { PriceHistory } from './entities/price-history.entity';
import { CreatePriceDto, UpdatePriceDto } from './dto/prices.dto';

// Discriminator lowercase snake_case (data-dictionary B-3). Đồng bộ với wiki_revisions ('place').
const ENTITY_PLACE = 'place';

@Injectable()
export class PricesService {
  constructor(private readonly repo: PricesRepository) {}

  async listByPlace(placeId: string, history: boolean) {
    const rows = history
      ? await this.repo.listByEntity(ENTITY_PLACE, placeId)
      : await this.repo.current(ENTITY_PLACE, placeId);
    return rows.map(this.toResponse);
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

  private toResponse(p: PriceHistory) {
    return {
      id: p.id,
      service_name: p.serviceName,
      amount: Number(p.amount),
      currency: p.currency,
      unit: p.unit,
      is_free: p.isFree,
      valid_from: p.validFrom,
      valid_to: p.validTo,
      verification_status: p.verificationStatus,
    };
  }
}
