import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Matches, Max, Min } from 'class-validator';

// Cùng 3 MIME type media.dto.ts chấp nhận — không import DTO đó (module này không coupling vào
// modules/media), lặp lại 3 chuỗi literal như storage.service.ts đã tự lặp cho đúng lý do.
export const ALLOWED_PROPOSAL_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedProposalPhotoMimeType = (typeof ALLOWED_PROPOSAL_PHOTO_MIME_TYPES)[number];

export const MAX_PROPOSAL_PHOTO_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // khớp trần của StorageService.

export class PresignProposalPhotoDto {
  @IsIn(ALLOWED_PROPOSAL_PHOTO_MIME_TYPES)
  content_type!: AllowedProposalPhotoMimeType;

  @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PROPOSAL_PHOTO_UPLOAD_SIZE_BYTES)
  size!: number;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'checksum_sha256 phải là 64 ký tự hex viết thường' })
  checksum_sha256!: string;

  // Không có proposal_id ở đây — đề xuất đích LUÔN là route param (:id), đã qua kiểm sở hữu ở
  // service, cùng lý do PresignMediaDto không có place_id.
}

export class RegisterProposalPhotoDto {
  // Server-generated format `media/{uuid-v4}.{ext}` — CÙNG tiền tố `media/` mà MediaService dùng
  // (đây là ảnh trong CHÍNH bảng/bucket media, không phải một vùng lưu trữ riêng).
  @IsString()
  @Matches(/^media\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i)
  key!: string;
}
