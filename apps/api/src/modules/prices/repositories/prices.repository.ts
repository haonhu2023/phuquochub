import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
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

  /**
   * Giá hiện hành: bản mới nhất mỗi service_name có now ∈ [valid_from, valid_to].
   *
   * Alias tường minh từng cột sang ĐÚNG tên property camelCase của `PriceHistory` (khớp chữ ký
   * khai báo `Promise<PriceHistory[]>`) — trước đây `SELECT *` trả nguyên tên cột DB (snake_case,
   * naming strategy toàn cục), khiến `p.serviceName`/`p.isFree`/`p.validFrom`/`p.validTo`/
   * `p.verificationStatus` ở mọi nơi gọi (PlacesService.getBySlug, PricesService.toResponse) đều
   * `undefined` — `id`/`amount`/`currency`/`unit` "đúng" chỉ vì tình cờ trùng chữ giữa hai kiểu
   * đặt tên. Bug này vô hình vì `JSON.stringify` nuốt mất khoá `undefined` thay vì phát `null`,
   * và test hiện có chỉ mock `current()` trả `[]`. Phải sửa ở đây để price trust gate (đọc
   * `verification_status` của TỪNG dòng giá) hoạt động đúng thay vì luôn coi mọi dòng là
   * "chưa xác minh" một cách vô tình.
   */
  current(entityType: string, entityId: string): Promise<PriceHistory[]> {
    return this.repo.query(
      `SELECT DISTINCT ON (service_name)
              id, entity_type AS "entityType", entity_id AS "entityId",
              service_name AS "serviceName", amount, currency, unit,
              is_free AS "isFree", description, display_order AS "displayOrder",
              valid_from AS "validFrom", valid_to AS "validTo", source_id AS "sourceId",
              verification_status AS "verificationStatus", verified_at AS "verifiedAt",
              updated_by AS "updatedBy", created_at AS "createdAt", updated_at AS "updatedAt",
              deleted_at AS "deletedAt"
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

  /**
   * Cập nhật trường scalar — cùng quy ước `PlacesRepository.updateScalars()`. `manager` TUỲ CHỌN:
   * truyền vào khi caller (VerificationsService, ADR-008) cần đồng bộ `verificationStatus`/
   * `verifiedAt` CÙNG transaction với `verifications`/`verification_events`.
   */
  async updateScalars(id: string, patch: Record<string, unknown>, manager?: EntityManager): Promise<void> {
    const keys = Object.keys(patch);
    if (keys.length === 0) {
      return;
    }
    const repo = manager ? manager.getRepository(PriceHistory) : this.repo;
    await repo.update({ id }, patch);
  }
}
