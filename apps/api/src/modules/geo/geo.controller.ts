import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { GeoService } from './geo.service';
import { BboxQueryDto, GeocodeQueryDto, NearbyQueryDto } from './dto/geo.dto';

// api.md §11 (geo). Toàn bộ đọc công khai.
@Controller('geo')
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  @Public()
  @Get('nearby')
  nearby(@Query() dto: NearbyQueryDto) {
    return this.geoService.nearby(dto);
  }

  @Public()
  @Get('bbox')
  bbox(@Query() dto: BboxQueryDto) {
    return this.geoService.bbox(dto);
  }

  @Public()
  @Get('geocode')
  geocode(@Query() dto: GeocodeQueryDto) {
    return this.geoService.geocode(dto.q);
  }
}
