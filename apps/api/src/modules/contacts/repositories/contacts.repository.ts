import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { Contact } from '../entities/contact.entity';

@Injectable()
export class ContactsRepository {
  constructor(
    @InjectRepository(Contact)
    private readonly repo: Repository<Contact>,
  ) {}

  listByOwner(ownerType: string, ownerId: string): Promise<Contact[]> {
    return this.repo.find({
      where: { ownerType, ownerId, deletedAt: IsNull() },
      order: { contactType: 'ASC', displayOrder: 'ASC' },
    });
  }

  findById(id: string): Promise<Contact | null> {
    return this.repo.findOne({ where: { id, deletedAt: IsNull() } });
  }

  /**
   * Token phiên bản (2026-09-17) cho CAS — `xmin::text` của Postgres, KHÔNG PHẢI cột mới (system
   * column có sẵn trên mọi dòng). `repo.find()`/`findOne()` không thể trả cột này (không phải
   * `@Column` khai trên entity), nên đọc riêng qua raw SQL — xem ContactsService.toResponse().
   */
  async getVersion(id: string): Promise<string | null> {
    const rows: Array<{ version: string }> = await this.repo.query(
      `SELECT xmin::text AS version FROM contacts WHERE id = $1`,
      [id],
    );
    return rows[0]?.version ?? null;
  }

  /** Bản gộp của getVersion() cho danh sách — một round-trip thay vì N+1 cho listByOwner(). */
  async getVersions(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows: Array<{ id: string; version: string }> = await this.repo.query(
      `SELECT id, xmin::text AS version FROM contacts WHERE id = ANY($1)`,
      [ids],
    );
    return new Map(rows.map((r) => [r.id, r.version]));
  }

  create(data: Partial<Contact>): Contact {
    return this.repo.create(data);
  }

  save(contact: Contact): Promise<Contact> {
    return this.repo.save(contact);
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.update({ id }, { deletedAt: new Date() });
  }

  /** Bỏ cờ is_primary các contact cùng loại/chủ (đảm bảo 1 primary/loại). */
  async clearPrimary(ownerType: string, ownerId: string, contactType: string): Promise<void> {
    await this.repo.update({ ownerType, ownerId, contactType, isPrimary: true }, { isPrimary: false });
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
    const repo = manager ? manager.getRepository(Contact) : this.repo;
    await repo.update({ id }, patch);
  }

  /**
   * CAS (Compare-And-Swap) cho ContactsService.update() (audit+conflict hardening, 2026-09-16;
   * sửa lại dùng xmin 2026-09-17) — áp patch CHỈ KHI `xmin::text` vẫn khớp giá trị đã đọc lúc gọi
   * update() (system column có sẵn, không thêm cột). 0 dòng khớp -> false, caller ném
   * ConflictException (409). Cùng khuôn PlacesRepository.updateScalarsIfUnchanged().
   */
  async updateScalarsIfUnchanged(
    id: string,
    patch: Record<string, unknown>,
    expectedVersion: string,
  ): Promise<boolean> {
    const COLUMN_MAP: Record<string, string> = {
      contactType: 'contact_type',
      value: 'value',
      label: 'label',
      isPrimary: 'is_primary',
      displayOrder: 'display_order',
    };
    const keys = Object.keys(patch).filter((k) => k in COLUMN_MAP);
    if (keys.length === 0) {
      return true;
    }
    const setClauses = keys.map((k, i) => `"${COLUMN_MAP[k]}" = $${i + 3}`).join(', ');
    // BUG THẬT phát hiện qua e2e trên Postgres thật (2026-09-16, xem PlacesRepository.
    // updateScalarsIfUnchanged()'s ghi chú đầy đủ): TypeORM's Repository.query() trả về TUPLE
    // `[rows, affectedCount]` cho UPDATE...RETURNING (khác INSERT...RETURNING, trả rows trực
    // tiếp) — `rows.length > 0` trên tuple đó LUÔN đúng, khiến CAS "luôn thành công" bất kể xung
    // đột thật. Phải destructure đúng phần tử [0].
    //
    // BUG THẬT thứ hai (2026-09-17, tự phát hiện lại khi rà soát): vòng sửa trước dùng
    // `date_trunc('milliseconds', ...)` ở cả hai vế để bù việc JS Date chỉ giữ được độ phân giải
    // mili-giây — nhưng làm tròn CÙNG một đơn vị ở cả hai vế mở đúng cửa sổ đua mà CAS phải chặn:
    // hai ghi THẬT SỰ đồng thời rơi cùng mili-giây vẫn có thể cùng "khớp" và đè mất nhau (lost
    // update). Bỏ hẳn timestamp, dùng `xmin::text` — đổi ở MỌI lần UPDATE bất kể đồng hồ hệ thống.
    const [rows]: [Array<{ id: string }>, number] = await this.repo.query(
      `UPDATE contacts SET ${setClauses}, updated_at = now()
        WHERE id = $1 AND xmin::text = $2 AND deleted_at IS NULL
        RETURNING id`,
      [id, expectedVersion, ...keys.map((k) => patch[k])],
    );
    return rows.length > 0;
  }
}
