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
  Query,
} from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { AuthorizationContext } from '../authz/decorators/authorization-context.decorator';
import { PlacesService } from './places.service';
import { RevisionsService } from '../revisions/revisions.service';
import { CreatePlaceDto, ListPlacesQueryDto, UpdatePlaceDto } from './dto/places.dto';

// api.md §11. Đọc công khai; ghi qua permission (deny-by-default).
@Controller('places')
export class PlacesController {
  constructor(
    private readonly placesService: PlacesService,
    private readonly revisionsService: RevisionsService,
  ) {}

  @Public()
  @Get()
  list(@Query() query: ListPlacesQueryDto) {
    return this.placesService.list(query);
  }

  // openapi listPlaceRevisions — lịch sử wiki_revisions (entity_type='place').
  // Đặt trước ':slug' để route 2 đoạn không bị nuốt bởi param 1 đoạn.
  @Public()
  @Get(':id/revisions')
  listRevisions(@Param('id', ParseUUIDPipe) id: string) {
    return this.revisionsService.listByPlace(id);
  }

  @Public()
  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.placesService.getBySlug(slug);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('Place.Create')
  create(@Body() dto: CreatePlaceDto, @CurrentUser() user: AuthPrincipal) {
    return this.placesService.create(dto, user.sub);
  }

  @Patch(':id')
  @RequirePermissions('Place.Edit.Managed')
  @AuthorizationContext({ resourceType: 'place', resource: { from: 'param', name: 'id' } })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlaceDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.placesService.update(id, dto, user.sub);
  }

  @Delete(':id')
  @RequirePermissions('Place.Archive')
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.placesService.archive(id, user.sub);
  }

  @Post(':id/approve')
  @RequirePermissions('Place.Approve')
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.placesService.approve(id, user.sub);
  }
}
