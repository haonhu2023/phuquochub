import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact } from './entities/contact.entity';
import { ContactsRepository } from './repositories/contacts.repository';
import { ContactsService } from './contacts.service';
import { ContactsController } from './contacts.controller';
import { CONTACT_AUTHZ_RESOLVER, ContactAuthzResolver } from './resolvers/contact-authz.resolver';

@Module({
  imports: [TypeOrmModule.forFeature([Contact])],
  controllers: [ContactsController],
  providers: [
    ContactsRepository,
    ContactsService,
    { provide: CONTACT_AUTHZ_RESOLVER, useClass: ContactAuthzResolver },
  ],
  // `ContactsService` export thêm (Verified Facts Ingestion, 2026-08-23) để
  // `VerifiedFactsIngestionService` tạo liên hệ qua ĐÚNG service layer — nó xử lý `clearPrimary`
  // khi `is_primary=true`, thứ mà ghi thẳng `ContactsRepository` sẽ bỏ qua và làm hỏng bất biến
  // "tối đa một primary mỗi (owner, contact_type)".
  exports: [ContactsRepository, ContactsService, CONTACT_AUTHZ_RESOLVER],
})
export class ContactsModule {}
