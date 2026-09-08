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

  /**
   * Tra theo ĐÚNG bốn cột của `uq_source_attr_entity_field_source` (migration
   * `1720001700000-InitSources.ts`) — idempotency key cho `SourcesService.attachAttribution`
   * (2026-09-09, attachAttribution idempotency fix). `field` dùng `IsNull()` khi `null`, cùng quy
   * ước `clearPrimary`/`listByEntity` ở trên.
   *
   * LƯU Ý (đã ghi ở migration, nhắc lại ở đây để không ai "sửa nhầm"): ràng buộc UNIQUE gốc KHÔNG
   * chặn được trùng lặp khi `field IS NULL` (ngữ nghĩa Postgres: NULL <> NULL). Với `field` khác
   * NULL — trường hợp DUY NHẤT `attachAttribution` hiện đang được gọi với (place_field, ví dụ
   * opening_hours) — cột này VẪN là chốt chặn DB thật. Trường hợp `field IS NULL` (vd
   * `entity_type='wiki_revision'`) chỉ được bảo vệ ở tầng ứng dụng bởi lần tra này, KHÔNG có backstop
   * DB — biết trước, chưa sửa trong lần này (không đủ phạm vi: đóng nó cần đổi chỉ mục, ảnh hưởng
   * dữ liệu wiki_revision hiện có).
   */
  findByUniqueKey(entityType: string, entityId: string, field: string | null, sourceId: string): Promise<SourceAttribution | null> {
    return this.repo.findOne({ where: { entityType, entityId, field: field ?? IsNull(), sourceId } });
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
