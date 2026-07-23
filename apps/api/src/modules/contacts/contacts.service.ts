import { Injectable, NotFoundException } from '@nestjs/common';
import { ContactsRepository } from './repositories/contacts.repository';
import { Contact } from './entities/contact.entity';
import { CreateContactDto, UpdateContactDto } from './dto/contacts.dto';

// Discriminator lowercase snake_case (data-dictionary B-3). Đồng bộ với wiki_revisions ('place').
const OWNER_PLACE = 'place';

@Injectable()
export class ContactsService {
  constructor(private readonly repo: ContactsRepository) {}

  async listByPlace(placeId: string) {
    const contacts = await this.repo.listByOwner(OWNER_PLACE, placeId);
    return contacts.map(this.toResponse);
  }

  async createForPlace(placeId: string, dto: CreateContactDto) {
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
    return this.toResponse(await this.repo.save(contact));
  }

  async update(id: string, dto: UpdateContactDto) {
    const contact = await this.repo.findById(id);
    if (!contact) {
      throw new NotFoundException('Không tìm thấy liên hệ');
    }
    const contactType = dto.contact_type ?? contact.contactType;
    if (dto.is_primary) {
      await this.repo.clearPrimary(contact.ownerType, contact.ownerId, contactType);
    }
    if (dto.contact_type !== undefined) contact.contactType = dto.contact_type;
    if (dto.value !== undefined) contact.value = dto.value;
    if (dto.label !== undefined) contact.label = dto.label;
    if (dto.is_primary !== undefined) contact.isPrimary = dto.is_primary;
    if (dto.display_order !== undefined) contact.displayOrder = dto.display_order;
    return this.toResponse(await this.repo.save(contact));
  }

  async remove(id: string) {
    const contact = await this.repo.findById(id);
    if (!contact) {
      throw new NotFoundException('Không tìm thấy liên hệ');
    }
    await this.repo.softDelete(id);
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
