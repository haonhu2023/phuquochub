import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MinLength, Min } from 'class-validator';

export class SearchQueryDto {
  @IsString()
  @MinLength(1)
  q!: string;

  @IsOptional() @IsString()
  type?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number;
}

export class SuggestQueryDto {
  @IsString()
  @MinLength(1)
  q!: string;
}
