import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { BeachesService } from './beaches.service';
import { ListBeachesQueryDto } from './dto/beaches.dto';

// openapi §Beaches. CHỈ có đường đọc danh sách: chi tiết bãi biển là `GET /places/{slug}`
// (không tạo URL chi tiết thứ hai cho cùng một Place), còn tạo/sửa/duyệt vẫn thuộc
// `POST|PATCH /places` với đúng permission sẵn có.
@Controller('beaches')
export class BeachesController {
  constructor(private readonly beachesService: BeachesService) {}

  @Public()
  @Get()
  list(@Query() query: ListBeachesQueryDto) {
    return this.beachesService.list(query);
  }
}
