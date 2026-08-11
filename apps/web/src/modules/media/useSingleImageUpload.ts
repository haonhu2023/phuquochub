'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { readSession } from '@/modules/auth/session';
import { presignMedia, registerMedia } from './api/media.api';
import { runImageUpload, UploadValidationError, validateImageFile } from './uploadPipeline';

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

    // Tiền kiểm tra ĐỒNG BỘ trước khi dựng preview — dùng chung `validateImageFile` với luồng ảnh
    // cơ sở, nên hai nơi không thể lệch nhau về MIME/kích thước cho phép.
    try {
      validateImageFile(file);
    } catch (err) {
      setError(err instanceof UploadValidationError ? err.message : 'Ảnh không hợp lệ.');
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
        // Ảnh review đi đường MỒ CÔI (không gắn cơ sở) — gắn + auto-publish khi tạo review.
        const media = await runImageUpload(file, {
          presign: (input) => presignMedia(input, session.accessToken),
          register: (key) => registerMedia(key, session.accessToken),
        });
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
