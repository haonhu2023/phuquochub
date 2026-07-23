import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { PriceHistory } from '../entities/price-history.entity';

@Injectable()
export class PricesRepository {
  constructor(
    @InjectRepository(PriceHistory)
    private readonly repo: Repository<PriceHistory>,
  ) {}

  /** Lịch sử đầy đủ theo entity. */
  listByEntity(entityType: string, entityId: string): Promise<PriceHistory[]> {
    return this.repo.find({
      where: { entityType, entityId, deletedAt: IsNull() },
      order: { displayOrder: 'ASC', createdAt: 'DESC' },
    });
  }

  /** Giá hiện hành: bản mới nhất mỗi service_name có now ∈ [valid_from, valid_to]. */
  current(entityType: string, entityId: string): Promise<PriceHistory[]> {
    return this.repo.query(
      `SELECT DISTINCT ON (service_name) *
       FROM price_history
       WHERE entity_type = $1 AND entity_id = $2 AND deleted_at IS NULL
         AND (valid_from IS NULL OR valid_from <= now())
         AND (valid_to IS NULL OR valid_to >= now())
       ORDER BY service_name, created_at DESC`,
      [entityType, entityId],
    );
  }

  findById(id: string): Promise<PriceHistory | null> {
    return this.repo.findOne({ where: { id, deletedAt: IsNull() } });
  }

  create(data: Partial<PriceHistory>): PriceHistory {
    return this.repo.create(data);
  }

  save(price: PriceHistory): Promise<PriceHistory> {
    return this.repo.save(price);
  }
}
