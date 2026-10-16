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

// Xác nhận (2026-10-16) — vai trò RIÊNG (`PlaceExternalIdentifier.Verify`, khác `Place.Edit.Managed`
// của route nhập ID) đối chiếu hồ sơ Google với địa điểm rồi gọi route confirm. `source_id`/
// `evidence_id` TUỲ CHỌN — bằng chứng đối chiếu của CHÍNH người xác nhận (có thể khác/bổ sung
// nguồn mà người nhập ID ban đầu đã đưa); để trống thì giữ nguyên nguồn/bằng chứng đã có, không
// xoá. KHÔNG nhận `verified_at` tuỳ ý, server luôn tự đặt là "bây giờ".
//
// `expected_external_id` BẮT BUỘC (owner yêu cầu sau khi đọc lại luồng) — ID mà người xác nhận ĐÃ
// ĐỌC/đối chiếu trên Google Maps, không phải "bất kỳ ID nào đang là primary lúc server xử lý".
// Dashboard luôn gửi đúng giá trị `current.external_id` đã tải — nếu ai đó đổi ID giữa lúc người
// xác nhận mở hồ sơ Google và lúc bấm nút, server từ chối (409) thay vì xác nhận nhầm ID mới.
export class ConfirmGooglePlaceIdDto {
  @IsString() @MinLength(1) @MaxLength(200)
  expected_external_id!: string;

  @IsOptional() @IsUUID()
  source_id?: string;

  @IsOptional() @IsUUID()
  evidence_id?: string;
}

// Thu hồi — cùng lý do `expected_external_id` ở ConfirmGooglePlaceIdDto.
export class RevokeGooglePlaceIdVerificationDto {
  @IsString() @MinLength(1) @MaxLength(200)
  expected_external_id!: string;
}
