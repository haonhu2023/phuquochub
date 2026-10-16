import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

// Nhập Google Place ID qua dashboard (quản trị theo record, xem controller). `externalId` khớp
// giới hạn cột `place_external_identifiers.external_id` (varchar 200). KHÔNG có `verifiedAt`/
// `isPrimary`/`provider` ở đây — provider cố định GOOGLE_PLACES trên route này (route có tên
// provider trong path, không nhận provider tuỳ ý từ body); `verifiedAt` KHÔNG BAO GIỜ nhận từ
// client (xem PlaceExternalIdentifiersController) — nhập ID không tự nghĩa là đã xác minh.
export class UpsertGooglePlaceIdDto {
  @IsString() @MinLength(1) @MaxLength(200)
  external_id!: string;

  @IsOptional() @IsUUID()
  source_id?: string;

  @IsOptional() @IsUUID()
  evidence_id?: string;
}
