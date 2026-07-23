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
import { ContactsService } from './contacts.service';
import { CreateContactDto, UpdateContactDto } from './dto/contacts.dto';

// api.md §11.1. owner suy từ path (owner_type=PLACE). Scope Managed ở mức resource
// (chủ cơ sở) sẽ siết khi có business_members (Sprint 6) — hiện guard mức permission.
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
  create(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateContactDto) {
    return this.contactsService.createForPlace(id, dto);
  }

  @Patch('contacts/:id')
  @RequirePermissions('Contact.Edit.Managed')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateContactDto) {
    return this.contactsService.update(id, dto);
  }

  @Delete('contacts/:id')
  @RequirePermissions('Contact.Edit.Managed')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.contactsService.remove(id);
  }
}
