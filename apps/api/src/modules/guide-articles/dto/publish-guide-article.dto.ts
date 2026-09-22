import { IsInt, Min } from 'class-validator';

// POST /admin/guide-articles/:id/publish body.
export class PublishGuideArticleDto {
  @IsInt() @Min(1)
  expectedContentVersion!: number;
}
