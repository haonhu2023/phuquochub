import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { AttractionsService } from './attractions.service';
import { ListAttractionsQueryDto } from './dto/attractions.dto';

// openapi §Attractions. CHỈ có đường đọc danh sách: chi tiết điểm tham quan là
// `GET /places/{slug}` (không tạo URL chi tiết thứ hai cho cùng một Place), còn tạo/sửa/duyệt
// vẫn thuộc `POST|PATCH /places` với đúng permission sẵn có.
@Controller('attractions')
export class AttractionsController {
  constructor(private readonly attractionsService: AttractionsService) {}

  @Public()
  @Get()
  list(@Query() query: ListAttractionsQueryDto) {
    return this.attractionsService.list(query);
  }
}
