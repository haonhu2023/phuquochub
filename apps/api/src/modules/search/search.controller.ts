import { Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { Public } from '../authz/decorators/public.decorator';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { SearchService } from './search.service';
import { SearchQueryDto, SuggestQueryDto } from './dto/search.dto';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Get()
  search(@Query() dto: SearchQueryDto) {
    return this.searchService.search(dto);
  }

  @Public()
  @Get('suggest')
  suggest(@Query() dto: SuggestQueryDto) {
    return this.searchService.suggest(dto);
  }

  @Post('reindex')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions('Search.Reindex')
  reindex() {
    return this.searchService.reindex();
  }
}
