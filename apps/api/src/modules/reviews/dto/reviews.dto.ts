import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

// Khớp requestBody createReview trong openapi.yaml (/places/{id}/reviews). media_ids: chỉ
// gắn media MỒ CÔI (chưa gắn chủ nào) mà chính user đã upload — xem ReviewsService.create.
export class CreateReviewDto {
  @IsInt() @Min(1) @Max(5)
  rating!: number;

  @IsOptional() @IsString()
  content?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUUID('4', { each: true })
  media_ids?: string[];
}
