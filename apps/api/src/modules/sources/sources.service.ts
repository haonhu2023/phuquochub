import { Injectable, NotFoundException } from '@nestjs/common';
import { SourcesRepository } from './repositories/sources.repository';
import { AttributionWithSource, SourceAttributionsRepository } from './repositories/source-attributions.repository';
import { Source } from './entities/source.entity';
import { SourceAttribution } from './entities/source-attribution.entity';
import { SOURCE_TYPE_DEFAULT_RELIABILITY } from './sources.enums';
import { CreateAttributionDto, CreateSourceDto } from './dto/sources.dto';

// Kết quả phân xử xung đột nguồn (source.md §7): is_primary → reliability → retrieved_at
// → hàng chờ moderator. Hàm thuần (pure), không phụ thuộc DB — dễ test từng nhánh (Module 12 Gate 3).
export type ConflictResolution =
  | { status: 'resolved'; reason: 'primary' | 'reliability' | 'freshness'; attribution: SourceAttribution }
  | { status: 'needs_moderator'; candidates: AttributionWithSource[] };

export function resolveConflict(candidates: AttributionWithSource[]): ConflictResolution | null {
  if (candidates.length === 0) {
    return null;
  }
  if (candidates.length === 1) {
    return { status: 'resolved', reason: 'primary', attribution: candidates[0].attribution };
  }

  // 1) is_primary=true thắng (chốt tại nguồn khai báo). Duy nhất theo thiết kế
  //    (SourcesService.attachAttribution tự bỏ cờ primary cũ trước khi gán mới).
  const primary = candidates.filter((c) => c.attribution.isPrimary);
  if (primary.length === 1) {
    return { status: 'resolved', reason: 'primary', attribution: primary[0].attribution };
  }
  const pool = primary.length > 1 ? primary : candidates;

  // 2) reliability (đã tinh chỉnh trên `sources`) cao nhất.
  const maxReliability = Math.max(...pool.map((c) => c.reliability));
  const byReliability = pool.filter((c) => c.reliability === maxReliability);
  if (byReliability.length === 1) {
    return { status: 'resolved', reason: 'reliability', attribution: byReliability[0].attribution };
  }

  // 3) retrieved_at mới hơn (dữ liệu tươi hơn thắng; null luôn thua bất kỳ mốc thời gian nào).
  const withDate = byReliability.filter((c) => c.retrievedAt !== null);
  if (withDate.length > 0) {
    const maxTime = Math.max(...withDate.map((c) => c.retrievedAt!.getTime()));
    const byFreshness = withDate.filter((c) => c.retrievedAt!.getTime() === maxTime);
    if (byFreshness.length === 1) {
      return { status: 'resolved', reason: 'freshness', attribution: byFreshness[0].attribution };
    }
  }

  // 4) Vẫn hòa (kể cả khi withDate rỗng — mọi ứng viên đều thiếu retrieved_at) → moderator quyết.
  return { status: 'needs_moderator', candidates: byReliability };
}

@Injectable()
export class SourcesService {
  constructor(
    private readonly sourcesRepo: SourcesRepository,
    private readonly attributionsRepo: SourceAttributionsRepository,
  ) {}

  async createSource(dto: CreateSourceDto, actorUserId?: string): Promise<Source> {
    const source = this.sourcesRepo.create({
      type: dto.type,
      kind: dto.kind,
      title: dto.title ?? null,
      url: dto.url ?? null,
      externalRef: dto.external_ref ?? null,
      publisher: dto.publisher ?? null,
      authorUserId: actorUserId ?? null,
      license: dto.license ?? null,
      reliability: dto.reliability ?? SOURCE_TYPE_DEFAULT_RELIABILITY[dto.type],
      language: dto.language ?? null,
      retrievedAt: dto.retrieved_at ? new Date(dto.retrieved_at) : null,
      metadata: dto.metadata ?? null,
    });
    return this.sourcesRepo.save(source);
  }

  async getSource(id: string): Promise<Source> {
    const source = await this.sourcesRepo.findById(id);
    if (!source) {
      throw new NotFoundException('Không tìm thấy nguồn');
    }
    return source;
  }

  async attachAttribution(dto: CreateAttributionDto, actorUserId?: string): Promise<SourceAttribution> {
    // FK "source_id" tự xác thực khi save (báo lỗi nếu nguồn không tồn tại) — không query
    // trước để tránh race điều kiện thừa; NotFoundException ở đây chỉ bọc lỗi FK rõ ràng hơn.
    await this.getSource(dto.source_id);

    if (dto.is_primary) {
      await this.attributionsRepo.clearPrimary(dto.entity_type, dto.entity_id, dto.field ?? null);
    }

    const attribution = this.attributionsRepo.create({
      sourceId: dto.source_id,
      entityType: dto.entity_type,
      entityId: dto.entity_id,
      field: dto.field ?? null,
      confidence: dto.confidence ?? null,
      note: dto.note ?? null,
      isPrimary: dto.is_primary ?? false,
      createdBy: actorUserId ?? null,
    });
    return this.attributionsRepo.save(attribution);
  }

  async listAttributionsFor(entityType: string, entityId: string, field?: string) {
    const attributions = await this.attributionsRepo.listByEntity(entityType, entityId, field);
    if (attributions.length === 0) {
      return [];
    }
    const sourceIds = Array.from(new Set(attributions.map((a) => a.sourceId)));
    const sources = await Promise.all(sourceIds.map((id) => this.sourcesRepo.findById(id)));
    const sourceById = new Map(sources.filter((s): s is Source => s !== null).map((s) => [s.id, s]));

    return attributions.map((a) => {
      const source = sourceById.get(a.sourceId) ?? null;
      return {
        id: a.id,
        entity_type: a.entityType,
        entity_id: a.entityId,
        field: a.field,
        is_primary: a.isPrimary,
        confidence: a.confidence,
        note: a.note,
        verified_by: a.verifiedBy,
        verified_at: a.verifiedAt,
        source: source && {
          id: source.id,
          type: source.type,
          title: source.title,
          publisher: source.publisher,
          license: source.license,
          reliability: source.reliability,
        },
      };
    });
  }

  /** Phân xử §7 cho một entity/field — dùng khi hiển thị "giá trị nào là chính thức". */
  async resolvePrimaryAttribution(
    entityType: string,
    entityId: string,
    field?: string,
  ): Promise<ConflictResolution | null> {
    const candidates = await this.attributionsRepo.listWithSourceReliability(entityType, entityId, field);
    return resolveConflict(candidates);
  }

  async verifyAttribution(id: string, moderatorUserId: string): Promise<SourceAttribution> {
    const attribution = await this.attributionsRepo.findById(id);
    if (!attribution) {
      throw new NotFoundException('Không tìm thấy attribution');
    }
    attribution.verifiedBy = moderatorUserId;
    attribution.verifiedAt = new Date();
    return this.attributionsRepo.save(attribution);
  }
}
