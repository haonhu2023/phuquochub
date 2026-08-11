import { sha256Hex } from '@/lib/sha256';
import { putToPresignedUrl } from './api/media.api';
import { ALLOWED_IMAGE_MIME_TYPES, MAX_UPLOAD_SIZE_BYTES, type AllowedImageMimeType } from './types';

/**
 * Đường ống upload DÙNG CHUNG: kiểm tra → băm → presign → PUT thẳng lên object storage → đăng ký.
 *
 * Tách ra khi có consumer THỨ HAI (ảnh cơ sở, 2026-08-11) — trước đó logic này nằm trong
 * `useSingleImageUpload` phục vụ riêng ảnh review. Hai consumer chỉ khác nhau ở HAI lời gọi API
 * (presign/register endpoint nào), nên phần khác biệt được truyền vào dưới dạng callback thay vì
 * sao chép cả quy trình. `useSingleImageUpload` giữ NGUYÊN hành vi đối ngoại (spec cũ của nó chạy
 * không sửa một dòng nào).
 *
 * Kiểm tra phía client ở đây CHỈ để phản hồi nhanh cho người dùng — backend vẫn xác thực lại đầy
 * đủ (MIME/kích thước ở DTO, và verifyUploadedObject đối chiếu content-type/size/checksum THẬT của
 * object đã tải lên). Không có bước nào ở đây được coi là ranh giới bảo mật.
 */
export interface PresignResult {
  key: string;
  upload_url: string;
  expires_in: number;
}

export interface UploadCallbacks<TRegistered> {
  presign: (input: {
    content_type: string;
    size: number;
    checksum_sha256: string;
  }) => Promise<PresignResult>;
  register: (key: string) => Promise<TRegistered>;
}

/** Lỗi tiền kiểm tra — thông điệp đã sẵn sàng hiển thị cho người dùng (tiếng Việt). */
export class UploadValidationError extends Error {}

export function validateImageFile(file: File): void {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as AllowedImageMimeType)) {
    throw new UploadValidationError('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.');
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new UploadValidationError('Ảnh vượt quá dung lượng tối đa 10MB.');
  }
}

/**
 * Chạy trọn một lần upload. Ném lỗi ở bất kỳ bước nào (validate/presign/PUT/register) — caller
 * quyết định hiển thị thế nào. KHÔNG tự dọn object đã PUT khi `register` thất bại: object mồ côi
 * (chưa có owner, còn `pending`) đã có job dọn dẹp định kỳ xử lý sau 24h
 * (`MediaRepository.findOrphanCleanupCandidates`), nên client không cần — và không nên — tự xoá.
 */
export async function runImageUpload<TRegistered>(
  file: File,
  callbacks: UploadCallbacks<TRegistered>,
): Promise<TRegistered> {
  validateImageFile(file);
  const checksum = await sha256Hex(file);
  const presigned = await callbacks.presign({
    content_type: file.type,
    size: file.size,
    checksum_sha256: checksum,
  });
  await putToPresignedUrl(presigned.upload_url, file, file.type);
  return callbacks.register(presigned.key);
}
