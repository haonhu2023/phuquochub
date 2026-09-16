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

  /**
   * Token phiên bản (2026-09-17) cho CAS — `xmin::text` của Postgres, KHÔNG PHẢI cột mới. Cùng
   * khuôn ContactsRepository.getVersion() — xem đó để biết lý do không dùng `updated_at`.
   */
  async getVersion(id: string): Promise<string | null> {
    const rows: Array<{ version: string }> = await this.repo.query(
      `SELECT xmin::text AS version FROM price_history WHERE id = $1`,
      [id],
    );
    return rows[0]?.version ?? null;
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

  /**
   * CAS (2026-09-16, sửa lại dùng xmin 2026-09-17) — cùng khuôn
   * ContactsRepository.updateScalarsIfUnchanged()/PlacesRepository.updateScalarsIfUnchanged().
   * `xmin` là system column có sẵn trên mọi dòng, không thêm cột.
   */
  async updateScalarsIfUnchanged(
    id: string,
    patch: Record<string, unknown>,
    expectedVersion: string,
  ): Promise<boolean> {
    const COLUMN_MAP: Record<string, string> = {
      serviceName: 'service_name',
      amount: 'amount',
      unit: 'unit',
      isFree: 'is_free',
      description: 'description',
      validTo: 'valid_to',
      displayOrder: 'display_order',
    };
    const keys = Object.keys(patch).filter((k) => k in COLUMN_MAP);
    if (keys.length === 0) {
      return true;
    }
    const setClauses = keys.map((k, i) => `"${COLUMN_MAP[k]}" = $${i + 3}`).join(', ');
    // BUG THẬT phát hiện qua e2e trên Postgres thật (2026-09-16, xem PlacesRepository.
    // updateScalarsIfUnchanged()'s ghi chú đầy đủ): TypeORM's Repository.query() trả về TUPLE
    // `[rows, affectedCount]` cho UPDATE...RETURNING — `rows.length > 0` trên tuple đó LUÔN đúng,
    // khiến CAS "luôn thành công" bất kể xung đột thật. Phải destructure đúng phần tử [0].
    //
    // BUG THẬT thứ hai (2026-09-17): làm tròn timestamp về mili-giây ở cả hai vế (cách sửa trước)
    // vẫn để lọt lost update giữa hai ghi THẬT SỰ đồng thời rơi cùng mili-giây — xem
    // PlacesRepository.updateScalarsIfUnchanged()'s ghi chú đầy đủ. Dùng `xmin::text` thay vì bất
    // kỳ giá trị nào lấy từ JS Date: đổi ở MỌI lần UPDATE, không phụ thuộc đồng hồ hệ thống.
    const [rows]: [Array<{ id: string }>, number] = await this.repo.query(
      `UPDATE price_history SET ${setClauses}, updated_at = now()
        WHERE id = $1 AND xmin::text = $2 AND deleted_at IS NULL
        RETURNING id`,
      [id, expectedVersion, ...keys.map((k) => patch[k])],
    );
    return rows.length > 0;
  }
}
