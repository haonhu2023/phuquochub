import { Body, Controller, Delete, Get, Param, ParseEnumPipe, ParseUUIDPipe, Post } from '@nestjs/common';
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

  // Không @HttpCode riêng → mặc định Nest cho @Post() là 201, mang { data: null } (cùng quy ước
  // "EmptySuccess" đã có — vd DELETE /places/:id không @HttpCode riêng, mặc định 200 từ Nest cho
  // @Delete()). KHÔNG dùng 204 thật: codebase này không có tiền lệ nào, và 204 theo đúng HTTP spec
  // phải KHÔNG mang body — nhưng TransformInterceptor vẫn bọc payload qua RxJS map() bất kể status
  // code, nên một handler @HttpCode(204) trả về `undefined` sẽ khiến body thực tế phụ thuộc hành
  // vi ngầm của Express/Node với 204, một rủi ro không đáng để lệch quy ước đã có.
  @Post()
  async save(@Body() dto: CreateSavedItemDto, @CurrentUser() user: AuthPrincipal) {
    await this.service.save(user.sub, dto.target_type, dto.target_id);
    return null;
  }

  // DELETE /saved-items/:targetType/:targetId — target_type/target_id trong path (không phải
  // body, theo đúng quy ước REST cho "bỏ lưu đúng MỘT dòng xác định").
  @Delete(':targetType/:targetId')
  async unsave(
    @Param('targetType', new ParseEnumPipe(SavedItemTargetType)) targetType: SavedItemTargetType,
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    await this.service.unsave(user.sub, targetType, targetId);
    return null;
  }
}
