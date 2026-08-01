'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { sha256Hex } from '@/lib/sha256';
import { readSession } from '@/modules/auth/session';
import { presignMedia, putToPresignedUrl, registerMedia } from './api/media.api';
import { ALLOWED_IMAGE_MIME_TYPES, MAX_UPLOAD_SIZE_BYTES } from './types';

interface UseSingleImageUploadResult {
  preview: string | null;
  mediaId: string | null;
  uploading: boolean;
  error: string | null;
  onFileSelected: (e: ChangeEvent<HTMLInputElement>) => void;
  reset: () => void;
}

// Một ảnh duy nhất: chọn → tiền kiểm tra (MIME/kích thước) → hash → presign → PUT → register.
// Không có ảnh hưởng gì tới trạng thái ngoài chính component gọi hook này — không lưu global.
export function useSingleImageUpload(): UseSingleImageUploadResult {
  const [preview, setPreview] = useState<string | null>(null);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreview(null);
    setMediaId(null);
    setError(null);
    setUploading(false);
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const onFileSelected = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // cho phép chọn lại đúng file cũ nếu người dùng muốn thử lại sau lỗi
    if (!file) return;

    setError(null);
    setMediaId(null);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
      setError('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.');
      setPreview(null);
      return;
    }
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      setError('Ảnh vượt quá dung lượng tối đa 10MB.');
      setPreview(null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    previewUrlRef.current = objectUrl;
    setPreview(objectUrl);

    void (async () => {
      const session = readSession();
      if (!session) {
        setError('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
        return;
      }

      setUploading(true);
      try {
        const checksum = await sha256Hex(file);
        const presigned = await presignMedia(
          { content_type: file.type, size: file.size, checksum_sha256: checksum },
          session.accessToken,
        );
        await putToPresignedUrl(presigned.upload_url, file, file.type);
        const media = await registerMedia(presigned.key, session.accessToken);
        setMediaId(media.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Không tải được ảnh lên.');
        setMediaId(null);
      } finally {
        setUploading(false);
      }
    })();
  }, []);

  return { preview, mediaId, uploading, error, onFileSelected, reset };
}
