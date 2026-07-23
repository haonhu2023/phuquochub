import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { PricesService } from './prices.service';
import { CreatePriceDto, UpdatePriceDto } from './dto/prices.dto';

// api.md §11.2. entity suy từ path (entity_type=PLACE). Append-only.
@Controller()
export class PricesController {
  constructor(private readonly pricesService: PricesService) {}

  @Public()
  @Get('places/:id/prices')
  list(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('history', new ParseBoolPipe({ optional: true })) history?: boolean,
  ) {
    return this.pricesService.listByPlace(id, history ?? false);
  }

  @Post('places/:id/prices')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('Price.Edit.Managed')
  create(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreatePriceDto) {
    return this.pricesService.createForPlace(id, dto);
  }

  @Patch('prices/:id')
  @RequirePermissions('Price.Edit.Managed')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePriceDto) {
    return this.pricesService.update(id, dto);
  }
}
