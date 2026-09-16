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
   * CAS (Compare-And-Swap) cho ContactsService.update() (audit+conflict hardening, 2026-09-16) —
   * áp patch CHỈ KHI `updated_at` vẫn khớp giá trị đã đọc lúc gọi update() (`@UpdateDateColumn`
   * có sẵn trên entity — không thêm cột). 0 dòng khớp -> false, caller ném ConflictException
   * (409). Cùng khuôn PlacesRepository.updateScalarsIfUnchanged().
   */
  async updateScalarsIfUnchanged(
    id: string,
    patch: Record<string, unknown>,
    expectedUpdatedAt: Date,
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
    // Cắt về độ phân giải milli-giây ở CẢ HAI vế — xem PlacesRepository.updateScalarsIfUnchanged()'s
    // ghi chú đầy đủ: `expectedUpdatedAt` (thường là chuỗi ISO do client gửi) chỉ có độ phân giải
    // milli-giây, so trực tiếp với cột timestamptz (micro-giây) gần như luôn lệch, gây 409 giả.
    const [rows]: [Array<{ id: string }>, number] = await this.repo.query(
      `UPDATE contacts SET ${setClauses}, updated_at = now()
        WHERE id = $1 AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $2::timestamptz) AND deleted_at IS NULL
        RETURNING id`,
      [id, expectedUpdatedAt, ...keys.map((k) => patch[k])],
    );
    return rows.length > 0;
  }
}
