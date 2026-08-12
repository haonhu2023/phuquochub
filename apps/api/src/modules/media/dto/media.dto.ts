import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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

/**
 * Trần số ảnh trong MỘT yêu cầu sắp xếp. Không phải quy tắc nghiệp vụ "một cơ sở tối đa 200 ảnh"
 * — chỉ là chặn trên cho payload, để một mảng khổng lồ không thành `unnest()` khổng lồ. Vượt trần
 * này nghĩa là cơ sở đã có nhiều ảnh hơn màn hình quản lý dự kiến, cần thiết kế phân trang riêng.
 */
export const MAX_REORDER_MEDIA_IDS = 200;

/**
 * Sắp xếp lại ảnh của cơ sở (`PATCH /places/{placeId}/media/order`).
 *
 * KHÔNG có `place_id` ở đây — cơ sở đích LUÔN là route param đã qua `PermissionsGuard`
 * (`@AuthorizationContext(place)`), cùng lý do đã gỡ `place_id` khỏi `PresignMediaDto` ở trên.
 *
 * `media_ids` phải là DANH SÁCH ĐẦY ĐỦ ảnh (chưa gỡ, MỌI trạng thái) của cơ sở, mỗi id đúng MỘT
 * lần — hợp đồng "toàn bộ hay không có gì". Kiểm tra tập đầy đủ nằm ở service
 * (`MediaService.reorderPlaceMedia`); ở đây chỉ chặn những thứ kiểm được mà không cần chạm DB:
 * mảng rỗng, phần tử không phải UUID, mảng quá dài.
 */
export class ReorderPlaceMediaDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_REORDER_MEDIA_IDS)
  @IsUUID('4', { each: true })
  media_ids!: string[];
}

/** Đặt ảnh bìa cho cơ sở (`PATCH /places/{placeId}/media/cover`). Cơ sở đích là route param. */
export class SetPlaceCoverDto {
  @IsUUID('4')
  media_id!: string;
}

// Cùng độ dài cột thật của `media` (media.entity.ts) — KHÔNG phát minh giới hạn riêng cho endpoint
// này, và KHÔNG cần migration vì cột đã tồn tại từ Media Upload Foundation.
export const MAX_CAPTION_LENGTH = 300;
export const MAX_ALT_TEXT_LENGTH = 200;

/**
 * Sửa mô tả/alt text của MỘT ảnh cơ sở (`PATCH /places/{placeId}/media/{mediaId}`).
 *
 * KHÔNG có `place_id` ở đây — cùng lý do mọi DTO khác của route này: cơ sở đích LUÔN là route
 * param đã qua `PermissionsGuard`. Cũng KHÔNG có `status`/`sort_order`/`cover`/`object_key`/
 * `bucket`/`checksum`/`review_id`/bất kỳ trường lưu trữ hay kiểm duyệt nào — `whitelist` +
 * `forbidNonWhitelisted` (main.ts) trả 400 nếu client cố gửi, và ngay cả khi lọt qua, service chỉ
 * ĐỌC đúng hai trường `caption`/`alt_text` của DTO này (không spread, không mass-assign).
 *
 * Cả hai trường ĐỘC LẬP tuỳ chọn (PATCH bán phần — cùng khuôn `UpdateContactDto`): trường vắng mặt
 * (`undefined`) giữ nguyên giá trị cũ; trường có mặt (kể cả chuỗi rỗng) GHI ĐÈ, rồi được
 * trim/chuẩn hoá rỗng-thành-null ở service (`normalizeMetadataField`, cùng khuôn
 * `MediaService.register()`: `dto.caption?.trim() || null`). `@IsOptional()` cho phép `null` lọt
 * qua bỏ qua kiểm tra `@IsString()` (cùng hành vi đã có ở `UpdateContactDto.label`) — service xử
 * lý `null` an toàn, không gọi `.trim()` trên nó.
 */
export class UpdatePlaceMediaMetadataDto {
  @IsOptional() @IsString() @MaxLength(MAX_CAPTION_LENGTH)
  caption?: string;

  @IsOptional() @IsString() @MaxLength(MAX_ALT_TEXT_LENGTH)
  alt_text?: string;
}
