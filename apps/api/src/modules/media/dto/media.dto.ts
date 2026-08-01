import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

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

  // Supported ownership scope (design review §7): ONLY place_id or no owner (orphan, attached
  // later via the existing attachToReview() flow). business_id/post_id/event_id/review_id are
  // deliberately NOT accepted here — whitelist+forbidNonWhitelisted (main.ts) rejects them 400 if
  // sent, rather than silently ignoring.
  @IsOptional() @IsUUID('4')
  place_id?: string;
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
