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
    return contacts.map(this.toResponse);
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
    return this.toResponse(saved);
  }

  /**
   * CAS (2026-09-16) — `dto.expected_updated_at`, khi có, được đối chiếu với `contact.updatedAt`
   * đọc TẠI ĐÂY qua updateScalarsIfUnchanged() (conditional UPDATE, 0 dòng khớp -> 409). KHÔNG
   * bắt buộc: caller cũ (nếu có, không truyền field này) giữ nguyên hành vi ghi trực tiếp — chỉ
   * client biết đọc trường CAS mới mới tự nguyện được bảo vệ, không phá client cũ.
   */
  async update(id: string, dto: UpdateContactDto, actorId: string | null = null) {
    const contact = await this.repo.findById(id);
    if (!contact) {
      throw new NotFoundException('Không tìm thấy liên hệ');
    }
    const before = this.toResponse(contact);
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

    if (dto.expected_updated_at) {
      const applied = await this.repo.updateScalarsIfUnchanged(id, patch, new Date(dto.expected_updated_at));
      if (!applied) {
        throw new ConflictException('Liên hệ đã được người khác cập nhật — tải lại và thử lại.');
      }
    } else {
      Object.assign(contact, patch);
      await this.repo.save(contact);
    }

    const updated = await this.repo.findById(id);
    await this.audit.record({
      event: 'contact.updated',
      entityType: 'contact',
      entityId: id,
      actorId,
      permission: 'Contact.Edit.Managed',
      before,
      after: this.toResponse(updated!),
    });
    return this.toResponse(updated!);
  }

  async remove(id: string, actorId: string | null = null) {
    const contact = await this.repo.findById(id);
    if (!contact) {
      throw new NotFoundException('Không tìm thấy liên hệ');
    }
    await this.repo.softDelete(id);
    await this.audit.record({
      event: 'contact.removed',
      entityType: 'contact',
      entityId: id,
      actorId,
      permission: 'Contact.Edit.Managed',
      before: this.toResponse(contact),
    });
    return null;
  }

  private toResponse(c: Contact) {
    return {
      id: c.id,
      owner_type: c.ownerType,
      contact_type: c.contactType,
      value: c.value,
      label: c.label,
      is_primary: c.isPrimary,
      verification_status: c.verificationStatus,
      display_order: c.displayOrder,
    };
  }
}
