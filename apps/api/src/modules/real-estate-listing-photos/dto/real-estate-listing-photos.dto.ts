import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Matches, Max, Min } from 'class-validator';

// Cùng 3 MIME type media.dto.ts chấp nhận (ALLOWED_MEDIA_MIME_TYPES) — không import DTO đó
// (module này không coupling vào modules/media), lặp lại 3 chuỗi literal như storage.service.ts
// đã tự lặp cho đúng lý do (core/feature-module không phụ thuộc chéo).
export const ALLOWED_LISTING_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedListingPhotoMimeType = (typeof ALLOWED_LISTING_PHOTO_MIME_TYPES)[number];

export const MAX_LISTING_PHOTO_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // khớp trần của StorageService.

export class PresignRealEstateListingPhotoDto {
  @IsIn(ALLOWED_LISTING_PHOTO_MIME_TYPES)
  content_type!: AllowedListingPhotoMimeType;

  @Type(() => Number) @IsInt() @Min(1) @Max(MAX_LISTING_PHOTO_UPLOAD_SIZE_BYTES)
  size!: number;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'checksum_sha256 phải là 64 ký tự hex viết thường' })
  checksum_sha256!: string;

  // Không có listing_id ở đây — tin đích LUÔN là route param (:id), đã qua kiểm sở hữu ở service
  // (RealEstateListingsService.getMine), cùng lý do PresignMediaDto không có place_id.
}

export class RegisterRealEstateListingPhotoDto {
  // Server-generated format `real-estate-listing-photos/{uuid-v4}.{ext}` (xem
  // RealEstateListingPhotosService.presign) — kiểm ở đây là defense-in-depth; cổng thật là tra
  // phiên presign trong Redis (không có phiên ⇒ 422, bất kể key có "trông hợp lệ" hay không).
  @IsString()
  @Matches(/^real-estate-listing-photos\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i)
  key!: string;
}
