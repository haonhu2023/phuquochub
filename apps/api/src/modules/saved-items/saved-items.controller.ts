import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseEnumPipe, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser, AuthPrincipal } from '../authz/decorators/current-user.decorator';
import { SavedItemsService } from './saved-items.service';
import { CreateSavedItemDto } from './dto/saved-items.dto';
import { SavedItemTargetType } from './saved-items.enums';

// Không @RequirePermissions nào — chỉ cần đăng nhập (cùng khuôn route 'mine' của job-listings/
// real-estate-listings). "Lưu" một tin không cần quyền đặc biệt, chỉ cần tin đó đang công khai
// (kiểm trong service).
@Controller('saved-items')
export class SavedItemsController {
  constructor(private readonly service: SavedItemsService) {}

  @Get()
  listMine(@CurrentUser() user: AuthPrincipal) {
    return this.service.listMine(user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  save(@Body() dto: CreateSavedItemDto, @CurrentUser() user: AuthPrincipal) {
    return this.service.save(user.sub, dto.target_type, dto.target_id);
  }

  // DELETE /saved-items/:targetType/:targetId — target_type/target_id trong path (không phải
  // body, theo đúng quy ước REST cho "bỏ lưu đúng MỘT dòng xác định").
  @Delete(':targetType/:targetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  unsave(
    @Param('targetType', new ParseEnumPipe(SavedItemTargetType)) targetType: SavedItemTargetType,
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.service.unsave(user.sub, targetType, targetId);
  }
}
