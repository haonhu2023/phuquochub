import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { SourceAttribution } from '../entities/source-attribution.entity';
import { Source } from '../entities/source.entity';

// Kết quả join attribution + độ tin/độ mới của nguồn — đầu vào cho thuật toán §7
// (is_primary → reliability → retrieved_at → hàng chờ moderator). Không dùng @ManyToOne
// (source_attributions không có relation tới sources trong entity, theo thiết kế), nên
// join thực hiện tường minh ở repository, KHÔNG rải sang service (coding-standard §3).
export interface AttributionWithSource {
  attribution: SourceAttribution;
  reliability: number;
  retrievedAt: Date | null;
}

@Injectable()
export class SourceAttributionsRepository {
  constructor(
    @InjectRepository(SourceAttribution)
    private readonly repo: Repository<SourceAttribution>,
  ) {}

  findById(id: string): Promise<SourceAttribution | null> {
    return this.repo.findOne({ where: { id } });
  }

  create(data: Partial<SourceAttribution>): SourceAttribution {
    return this.repo.create(data);
  }

  save(attribution: SourceAttribution): Promise<SourceAttribution> {
    return this.repo.save(attribution);
  }

  /** Bỏ cờ is_primary các attribution cùng (entity_type, entity_id, field) — đảm bảo tối
   * đa 1 primary/nhóm, giống ContactsRepository.clearPrimary. */
  async clearPrimary(entityType: string, entityId: string, field: string | null): Promise<void> {
    await this.repo.update(
      { entityType, entityId, field: field ?? IsNull(), isPrimary: true },
      { isPrimary: false },
    );
  }

  /** Mọi attribution của một entity (tuỳ chọn lọc theo field) — badge nguồn (source.md §1). */
  listByEntity(entityType: string, entityId: string, field?: string | null): Promise<SourceAttribution[]> {
    return this.repo.find({
      where:
        field === undefined
          ? { entityType, entityId }
          : { entityType, entityId, field: field ?? IsNull() },
      order: { createdAt: 'ASC' },
    });
  }

  /** Attribution + reliability/retrieved_at của nguồn — dùng để phân xử §7. */
  async listWithSourceReliability(
    entityType: string,
    entityId: string,
    field?: string | null,
  ): Promise<AttributionWithSource[]> {
    const qb = this.repo
      .createQueryBuilder('sa')
      .innerJoin(Source, 's', 's.id = sa.sourceId')
      .addSelect(['s.reliability', 's.retrievedAt'])
      .where('sa.entityType = :entityType', { entityType })
      .andWhere('sa.entityId = :entityId', { entityId });

    if (field !== undefined) {
      qb.andWhere('sa.field = :field', { field });
    }

    const rows = await qb.getRawAndEntities();
    return rows.entities.map((attribution, i) => ({
      attribution,
      reliability: Number(rows.raw[i].s_reliability),
      retrievedAt: rows.raw[i].s_retrievedAt ? new Date(rows.raw[i].s_retrievedAt) : null,
    }));
  }
}
