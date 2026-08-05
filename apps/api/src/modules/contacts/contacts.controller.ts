import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { AuthorizationContext } from '../authz/decorators/authorization-context.decorator';
import { CONTACT_AUTHZ_RESOLVER } from './resolvers/contact-authz.resolver';
import { ContactsService } from './contacts.service';
import { CreateContactDto, UpdateContactDto } from './dto/contacts.dto';

// api.md §11.1. owner suy từ path (owner_type=PLACE). ADR-019 M0.2: scope Managed giờ được cưỡng
// chế ở mức resource (chủ cơ sở, qua PermissionsGuard + @AuthorizationContext) — không còn chỉ
// guard mức permission như ghi chú cũ mô tả.
@Controller()
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Public()
  @Get('places/:id/contacts')
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.contactsService.listByPlace(id);
  }

  @Post('places/:id/contacts')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('Contact.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  create(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateContactDto) {
    return this.contactsService.createForPlace(id, dto);
  }

  @Patch('contacts/:id')
  @RequirePermissions('Contact.Edit.Managed')
  @AuthorizationContext({
    resourceType: 'contact',
    resource: { from: 'param', name: 'id' },
    resolver: CONTACT_AUTHZ_RESOLVER,
  })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateContactDto) {
    return this.contactsService.update(id, dto);
  }

  @Delete('contacts/:id')
  @RequirePermissions('Contact.Edit.Managed')
  @AuthorizationContext({
    resourceType: 'contact',
    resource: { from: 'param', name: 'id' },
    resolver: CONTACT_AUTHZ_RESOLVER,
  })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.contactsService.remove(id);
  }
}
