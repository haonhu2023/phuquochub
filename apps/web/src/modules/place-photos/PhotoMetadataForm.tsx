'use client';

import { useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/http';
import uiStyles from '@/components/ui/ui.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';
import type { PlacePhoto } from './types';
import styles from './place-photos.module.css';

// Cùng độ dài cột thật của `media` (apps/api/src/modules/media/entities/media.entity.ts,
// MAX_CAPTION_LENGTH/MAX_ALT_TEXT_LENGTH ở media.dto.ts) — chỉ để `maxLength` HTML phản hồi nhanh
// phía client; backend vẫn là nguồn xác thực cuối (whitelist/trim/rỗng-thành-null đều làm lại ở đó).
const MAX_CAPTION_LENGTH = 300;
const MAX_ALT_TEXT_LENGTH = 200;

export interface PhotoMetadataInput {
  caption?: string;
  alt_text?: string;
}

interface Props {
  photo: PlacePhoto;
  onSubmit: (input: PhotoMetadataInput) => Promise<void>;
}

function metadataErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Bạn không có quyền sửa ảnh của cơ sở này.';
    if (err.status === 404) return 'Không tìm thấy ảnh này. Vui lòng tải lại trang.';
    if (err.status < 500) return err.message;
  }
  // `onSubmit` (PhotosView.handleMetadataSave) ném Error thường (không phải ApiError) khi phiên
  // đăng nhập đã hết hạn TRƯỚC khi gọi API — cùng khuôn `ContactEditor.contactErrorMessage`.
  return err instanceof Error ? err.message : 'Không lưu được thông tin ảnh. Vui lòng thử lại.';
}

/**
 * Sửa mô tả (caption) / văn bản thay thế (alt_text) của MỘT ảnh — Owner Photo Metadata
 * (2026-08-12). Trạng thái (đang lưu/lỗi/thành công) hoàn toàn CỤC BỘ trong component này, cùng
 * khuôn `ContactEditor` — không phụ thuộc cờ `busy` dùng chung của sắp xếp/đặt bìa ở PhotosView,
 * vì hai nhóm thao tác ghi lên HAI cột khác nhau (caption/alt_text vs sort_order/cover_image_id)
 * và không có xung đột dữ liệu nào để phải khoá chéo.
 *
 * Lưu tường minh (nút "Lưu thông tin"), KHÔNG lưu theo từng phím gõ — tránh spam request và giữ
 * hành vi dễ đoán (thành công/thất bại rõ ràng cho MỘT lần bấm).
 */
export function PhotoMetadataForm({ photo, onSubmit }: Props) {
  const [caption, setCaption] = useState(photo.caption ?? '');
  const [altText, setAltText] = useState(photo.alt_text ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const captionId = `photo-caption-${photo.id}`;
  const altId = `photo-alt-${photo.id}`;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return; // chặn gửi trùng khi bấm nhanh nhiều lần / double-submit

    setError(null);
    setSuccess(false);
    setSubmitting(true);
    try {
      await onSubmit({ caption, alt_text: altText });
      setSuccess(true);
    } catch (err) {
      setError(metadataErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={submitting} className={styles.metadataForm}>
      <div className={uiStyles.field}>
        <label className={uiStyles.fieldLabel} htmlFor={captionId}>
          Mô tả ảnh
        </label>
        <input
          id={captionId}
          className={placeMgmtStyles.input}
          value={caption}
          onChange={(e) => {
            setCaption(e.target.value);
            setSuccess(false);
          }}
          maxLength={MAX_CAPTION_LENGTH}
          placeholder="vd: Hoàng hôn ở Dinh Cậu"
          disabled={submitting}
        />
      </div>

      <div className={uiStyles.field}>
        <label className={uiStyles.fieldLabel} htmlFor={altId}>
          Văn bản thay thế (Alt text)
        </label>
        <input
          id={altId}
          className={placeMgmtStyles.input}
          value={altText}
          onChange={(e) => {
            setAltText(e.target.value);
            setSuccess(false);
          }}
          maxLength={MAX_ALT_TEXT_LENGTH}
          placeholder="vd: Tháp đèn biển màu trắng trên mỏm đá"
          disabled={submitting}
        />
        <p className={placeMgmtStyles.fieldHint}>
          Mô tả ngắn nội dung chính của ảnh để hỗ trợ người dùng trình đọc màn hình.
        </p>
      </div>

      {error && (
        <p className={placeMgmtStyles.alert} role="alert">
          {error}
        </p>
      )}
      {success && !error && (
        <p className={placeMgmtStyles.success} role="status">
          Đã lưu thông tin ảnh.
        </p>
      )}

      <button type="submit" className={styles.orderBtn} disabled={submitting}>
        {submitting ? 'Đang lưu…' : 'Lưu thông tin'}
      </button>
    </form>
  );
}
