import { IsIn, IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';

// Lưu DRAFT bản dịch — CHỈ 4 trường văn bản dịch được (Gói C, khớp đúng field list owner đã chốt:
// title/description/requirements/benefits). KHÔNG có salary/contact/expires_at/... — những trường
// đó dùng CHUNG một bộ dữ liệu, không nhân đôi (owner yêu cầu rõ, xem checkpoint §Gói C).
//
// `expected_content_version` — CAS (Gói C, sửa 17/10/2026): BẮT BUỘC khi ĐÃ CÓ bản dịch (service
// kiểm tại runtime, không kiểm được ở DTO vì DTO không biết trạng thái DB) — giá trị
// `content_version` client đọc được gần nhất. Bỏ trống hợp lệ CHỈ khi đây là lần lưu ĐẦU TIÊN
// (chưa có row nào để xung đột).
export class UpsertJobListingTranslationDto {
  @IsOptional() @IsString() @MaxLength(200)
  title?: string | null;

  @IsOptional() @IsString() @MaxLength(4000)
  description?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  requirements?: string | null;

  @IsOptional() @IsString() @MaxLength(2000)
  benefits?: string | null;

  @IsOptional() @IsInt() @Min(1)
  expected_content_version?: number;
}

export class DecideJobListingTranslationDto {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;

  // BẮT BUỘC thật (owner: "Moderator phải duyệt đúng phiên bản đã đọc") — @IsOptional() ở DTO vì
  // lỗi "thiếu" phải là 400 rõ nghĩa từ service (xem decide()), không phải lỗi validation DTO
  // chung; service throw BadRequestException riêng khi thiếu.
  @IsOptional() @IsInt() @Min(1)
  expected_content_version?: number;
}
