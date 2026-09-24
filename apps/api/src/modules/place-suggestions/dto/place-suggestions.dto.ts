import { IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';
import { SUGGESTABLE_FIELDS, SuggestableField } from '../place-suggestions.service';

export class CreateSuggestionDto {
  @IsIn(SUGGESTABLE_FIELDS)
  field!: SuggestableField;

  @IsString() @MinLength(1) @MaxLength(2000)
  proposed_value!: string;

  // IsUrl mặc định yêu cầu protocol — chặn "www.example.com" không có scheme, đúng ý "nguồn" phải
  // là một liên kết truy cập được, không phải tên miền trần.
  @IsUrl({}, { message: 'source_url phải là một URL hợp lệ (có http:// hoặc https://)' })
  @MaxLength(500)
  source_url!: string;

  @IsOptional() @IsString() @MaxLength(1000)
  source_note?: string;
}

export class ResolveSuggestionDto {
  @IsIn(['applied', 'rejected'])
  action!: 'applied' | 'rejected';

  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;
}
