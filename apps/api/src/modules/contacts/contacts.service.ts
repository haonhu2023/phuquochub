import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ContactsRepository } from './repositories/contacts.repository';
import { Contact } from './entities/contact.entity';
import { CreateContactDto, UpdateContactDto } from './dto/contacts.dto';
import { AuditService } from '../../core/audit/audit.service';

// Discriminator lowercase snake_case (data-dictionary B-3). Đồng bộ với wiki_revisions ('place').
const OWNER_PLACE = 'place';

@Injectable()
export class ContactsService {
  constructor(
    private readonly repo: ContactsRepository,
    private readonly audit: AuditService,
  ) {}

  async listByPlace(placeId: string) {
    const contacts = await this.repo.listByOwner(OWNER_PLACE, placeId);
    const versions = await this.repo.getVersions(contacts.map((c) => c.id));
    return contacts.map((c) => this.toResponse(c, versions.get(c.id) ?? ''));
  }

  // `actorId` TUỲ CHỌN (2026-09-16, ADR-016 audit hardening) — giữ nguyên chữ ký cho caller hệ
  // thống hiện có (VerifiedFactsIngestionService, đợt nhập liệu hàng loạt không gắn với một
  // người dùng cụ thể); AuditService.record() đã chấp nhận actorId=null cho đúng trường hợp đó.
  // Route HTTP (ContactsController) LUÔN truyền actorId thật từ @CurrentUser().
  async createForPlace(placeId: string, dto: CreateContactDto, actorId: string | null = null) {
    if (dto.is_primary) {
      await this.repo.clearPrimary(OWNER_PLACE, placeId, dto.contact_type);
    }
    const contact = this.repo.create({
      ownerType: OWNER_PLACE,
      ownerId: placeId,
      contactType: dto.contact_type,
      value: dto.value,
      label: dto.label ?? null,
      isPrimary: dto.is_primary ?? false,
      displayOrder: dto.display_order ?? 0,
    });
    const saved = await this.repo.save(contact);
    await this.audit.record({
      event: 'contact.created',
      entityType: 'contact',
      entityId: saved.id,
      actorId,
      permission: 'Contact.Edit.Managed',
      context: { place_id: placeId, contact_type: saved.contactType },
    });
    const version = await this.repo.getVersion(saved.id);
    return this.toResponse(saved, version ?? '');
  }

  /**
   * CAS (2026-09-16, sửa lại dùng xmin 2026-09-17) — `dto.expected_version`, khi có, được đối
   * chiếu với `xmin::text` đọc TẠI ĐÂY qua updateScalarsIfUnchanged() (conditional UPDATE, 0 dòng
   * khớp -> 409). KHÔNG bắt buộc: caller cũ (nếu có, không truyền field này) giữ nguyên hành vi
   * ghi trực tiếp — chỉ client biết đọc trường CAS mới mới tự nguyện được bảo vệ, không phá client
   * cũ.
   */
  async update(id: string, dto: UpdateContactDto, actorId: string | null = null) {
    const contact = await this.repo.findById(id);
    if (!contact) {
      throw new NotFoundException('Không tìm thấy liên hệ');
    }
    const beforeVersion = await this.repo.getVersion(id);
    const before = this.toResponse(contact, beforeVersion ?? '');
    const contactType = dto.contact_type ?? contact.contactType;
    if (dto.is_primary) {
      await this.repo.clearPrimary(contact.ownerType, contact.ownerId, contactType);
    }
    const patch: Record<string, unknown> = {};
    if (dto.contact_type !== undefined) patch.contactType = dto.contact_type;
    if (dto.value !== undefined) patch.value = dto.value;
    if (dto.label !== undefined) patch.label = dto.label;
    if (dto.is_primary !== undefined) patch.isPrimary = dto.is_primary;
    if (dto.display_order !== undefined) patch.displayOrder = dto.display_order;

    if (dto.expected_version) {
      const applied = await this.repo.updateScalarsIfUnchanged(id, patch, dto.expected_version);
      if (!applied) {
        throw new ConflictException('Liên hệ đã được người khác cập nhật — tải lại và thử lại.');
      }
    } else {
      Object.assign(contact, patch);
      await this.repo.save(contact);
    }

    const updated = await this.repo.findById(id);
    const afterVersion = await this.repo.getVersion(id);
    await this.audit.record({
      event: 'contact.updated',
      entityType: 'contact',
      entityId: id,
      actorId,
      permission: 'Contact.Edit.Managed',
      before,
      after: this.toResponse(updated!, afterVersion ?? ''),
    });
    return this.toResponse(updated!, afterVersion ?? '');
  }

  async remove(id: string, actorId: string | null = null) {
    const contact = await this.repo.findById(id);
    if (!contact) {
      throw new NotFoundException('Không tìm thấy liên hệ');
    }
    const version = await this.repo.getVersion(id);
    await this.repo.softDelete(id);
    await this.audit.record({
      event: 'contact.removed',
      entityType: 'contact',
      entityId: id,
      actorId,
      permission: 'Contact.Edit.Managed',
      before: this.toResponse(contact, version ?? ''),
    });
    return null;
  }

  private toResponse(c: Contact, version: string) {
    return {
      id: c.id,
      owner_type: c.ownerType,
      contact_type: c.contactType,
      value: c.value,
      label: c.label,
      is_primary: c.isPrimary,
      verification_status: c.verificationStatus,
      display_order: c.displayOrder,
      /**
       * CAS token (2026-09-16, sửa lại dùng xmin 2026-09-17) — client gửi lại NGUYÊN VĂN qua
       * `UpdateContactDto.expected_version` để bảo vệ optimistic-concurrency thật
       * (updateScalarsIfUnchanged() phía dưới), không phải chỉ hiển thị. KHÔNG PHẢI timestamp
       * (đổi tên từ `updated_at`): xem ContactsRepository.updateScalarsIfUnchanged()'s ghi chú đầy
       * đủ về vì sao một token lấy từ JS Date (kể cả làm tròn mili-giây) vẫn để lọt lost update
       * giữa hai ghi cùng mili-giây — `xmin::text` đổi ở MỌI lần UPDATE, không phụ thuộc đồng hồ.
       */
      version,
    };
  }
}
