import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { GuideArticleCategory } from '../guide-article.enums';
import { MAX_TAG_LENGTH } from './guide-tags.constants';

// Query của `GET /guide-articles` (public) — cùng khuôn ListPlacesQueryDto/GetPlaceDetailQueryDto:
// MỘT DTO gom hết query param của route, không trộn `@Query('x')` đơn lẻ với `@Query() dto` cho
// cùng handler (tránh whitelist/transform áp hai lần khác nhau lên cùng object query). `locale`
// giữ `?? 'vi'` ở controller như trước — DTO chỉ validate hình dạng, không đặt default.
export class ListPublishedGuideArticlesQueryDto {
  @IsOptional() @IsString() @MaxLength(35)
  locale?: string;

  @IsOptional() @IsEnum(GuideArticleCategory)
  category?: GuideArticleCategory;

  @IsOptional() @IsString() @MaxLength(MAX_TAG_LENGTH)
  tag?: string;
}
