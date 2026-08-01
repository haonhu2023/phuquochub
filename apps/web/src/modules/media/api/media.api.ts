import { apiPost } from '@/lib/http';
import type { UploadedMedia } from '../types';

interface PresignMediaInput {
  content_type: string;
  size: number;
  checksum_sha256: string;
}

interface PresignMediaResult {
  key: string;
  upload_url: string;
  expires_in: number;
}

/** Xin presigned PUT URL. Không gửi place_id — luồng mồ côi, gắn sau qua media_ids khi tạo review. */
export async function presignMedia(
  input: PresignMediaInput,
  accessToken: string,
): Promise<PresignMediaResult> {
  return apiPost<PresignMediaResult>('/media/presign', accessToken, input);
}

/** PUT trực tiếp lên object storage bằng presigned URL — KHÔNG qua apiPost (không phải endpoint
 * của chính API, không có envelope {success,data} để bóc). */
export async function putToPresignedUrl(uploadUrl: string, file: File, contentType: string): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!res.ok) {
    throw new Error(`Tải ảnh lên storage thất bại (${res.status})`);
  }
}

/** Đăng ký media sau khi PUT thành công. */
export async function registerMedia(key: string, accessToken: string): Promise<UploadedMedia> {
  return apiPost<UploadedMedia>('/media', accessToken, { key });
}
