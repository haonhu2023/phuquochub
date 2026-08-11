import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

// Media Upload Foundation (design review, 2026-07-30). Backend-only, no resize/thumbnail/EXIF/AI —
// see docs/data/modules/media.md.
export const ALLOWED_MEDIA_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedMediaMimeType = (typeof ALLOWED_MEDIA_MIME_TYPES)[number];

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10 MiB — matches StorageService's ceiling.

export class PresignMediaDto {
  @IsIn(ALLOWED_MEDIA_MIME_TYPES)
  content_type!: AllowedMediaMimeType;

  @Type(() => Number) @IsInt() @Min(1) @Max(MAX_UPLOAD_SIZE_BYTES)
  size!: number;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'checksum_sha256 phải là 64 ký tự hex viết thường' })
  checksum_sha256!: string;

  // KHÔNG có trường chủ sở hữu nào ở đây (place_id/business_id/post_id/event_id/review_id) —
  // `whitelist`+`forbidNonWhitelisted` (main.ts) trả 400 nếu client cố gửi.
  //
  // `place_id` TỪNG tồn tại ở DTO này và bị GỠ BỎ (Owner Place Photos, 2026-08-11). Nó chỉ được
  // kiểm tra "place có tồn tại không", KHÔNG hề kiểm tra người gọi có quyền quản lý place đó —
  // permission của route là `Media.Upload.Own` gắn với CHÍNH người gọi (PRINCIPAL_RESOLVER), nên
  // bất kỳ member nào cũng gắn được media vào cơ sở của người khác. Trước đây hệ quả còn tiềm ẩn
  // (media `pending` không hiển thị công khai và không có gì đưa nó vào hàng chờ duyệt), nhưng
  // milestone này ĐƯA media pending của place vào hàng chờ kiểm duyệt — nếu giữ nguyên, kẻ tấn
  // công có thể bơm ảnh vào cơ sở bất kỳ và chờ moderator vô tình duyệt. Không có consumer nào
  // từng gửi trường này (media.api.ts nói rõ "Không gửi place_id — luồng mồ côi").
  //
  // Đường HỢP LỆ để gắn ảnh vào một cơ sở là `POST /places/{id}/media/presign` — ở đó place id là
  // ROUTE PARAM nên `@AuthorizationContext` phân giải và cưỡng chế được quyền trên CHÍNH place đó
  // (PermissionsGuard chỉ đọc được resource id từ `param`/`principal`, không đọc từ body).
}

export class CreateMediaDto {
  // Server-generated format `media/{uuid-v4}.{ext}` (see MediaService.presign) — validated here
  // as defense-in-depth; the real gate is the Redis presign-session lookup (no session ⇒ 422,
  // regardless of whether the key merely looks well-formed).
  @IsString()
  @Matches(/^media\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i)
  key!: string;

  @IsOptional() @IsString() @MaxLength(300)
  caption?: string;

  @IsOptional() @IsString() @MaxLength(200)
  alt?: string;
}
