import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
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
}
