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
  exports: [ContactsRepository, CONTACT_AUTHZ_RESOLVER],
})
export class ContactsModule {}
