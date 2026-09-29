'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useSingleImageUpload } from '@/modules/media/useSingleImageUpload';
import { useAuthenticatedImage } from '@/modules/media/useAuthenticatedImage';
import { buildApiUrl } from '@/lib/api';
import { readSession } from '@/modules/auth/session';
import type { MediaModerationStatus } from '../guide/types';

interface Props {
  mediaId: string;
  /** URL đã resolve của `mediaId` hiện tại (từ `heroImageUrl`/block `content.imageUrl` — backend
   *  đã tính sẵn, xem GuideArticlesService.resolveImageBlockContent). `null` khi chưa chọn ảnh
   *  nào, hoặc khi mediaId vừa đổi qua một lần upload mới (preview cục bộ thay thế nó). */
  existingImageUrl?: string | null;
  /** Trạng thái THẬT của `mediaId` (GuideArticlesService — heroMediaStatus / block mediaStatus).
   *  `existingImageUrl` luôn được XÂY (không phải `null`) miễn `mediaId` tồn tại, NHƯNG nó trỏ tới
   *  kênh công khai (`GET /media/:id/file`) — kênh đó 404 cho MỌI thứ chưa `published` (Secure
   *  Private Media). Không có prop này, ảnh vừa tải xong nhưng còn `pending` xem như ảnh vỡ sau khi
   *  tải lại trang, dù chủ bài viết là người vừa tải nó lên. */
  mediaStatus?: MediaModerationStatus | null;
  onChange: (mediaId: string) => void;
  label: string;
  /** Báo cho form cha biết ảnh NÀY còn đang tải lên hay không — form cha khoá nút Lưu trong lúc
   *  đó (2026-09-27, sự cố production: lưu trong lúc ảnh còn đang tải bỏ lỡ mediaId mới mà không
   *  báo lỗi gì — "thành công giả"). Không bắt buộc để các nơi dùng picker này mà không cần theo
   *  dõi (hiện tại: chỉ GuideArticleEditorView cần). */
  onUploadingChange?: (uploading: boolean) => void;
}

// G-C (2026-09-22) — thay ô nhập UUID thô bằng chọn ảnh THẬT: chọn file → tải lên → xem trước
// ngay, KHÔNG còn phải tự tay copy một UUID từ nơi khác. Dùng lại NGUYÊN VẸN
// `useSingleImageUpload` (đường ống presign→PUT→register mồ côi đã có sẵn cho ảnh review) — không
// có "thư viện media" để duyệt lại ảnh cũ (ngoài phạm vi, xem §Ngoài phạm vi của kế hoạch: không
// page builder/media library mới); mỗi lần chọn là một upload mới, đúng cách owner-decision-queue
// và moderation đã quen (ảnh mới luôn vào `pending`, cần published trước khi publish() chấp nhận —
// assertMediaPublishEligible đã cưỡng chế điều đó, component này không cần lặp lại kiểm tra đó).
export function GuideMediaPicker({ mediaId, existingImageUrl, mediaStatus, onChange, label, onUploadingChange }: Props) {
  const { preview, mediaId: uploadedId, uploading, error, onFileSelected, reset } = useSingleImageUpload();

  // Ảnh chưa `published` không thể tải qua kênh công khai (`existingImageUrl`) — dùng kênh nội bộ
  // (yêu cầu Authorization header, nên KHÔNG thể gắn thẳng vào `<img src>`, xem
  // useAuthenticatedImage's doc). Chỉ kích hoạt khi thực sự cần: có mediaId, KHÔNG có preview cục
  // bộ (mới upload trong phiên này — preview blob đã đúng rồi), và trạng thái xác nhận KHÔNG phải
  // published (không lãng phí một request xác thực cho ảnh vốn đã xem được qua kênh công khai).
  const needsInternalPreview = Boolean(mediaId) && !preview && mediaStatus != null && mediaStatus !== 'published';
  const session = needsInternalPreview ? readSession() : null;
  const internal = useAuthenticatedImage(
    needsInternalPreview ? buildApiUrl(`/media/${mediaId}/moderation-file`) : null,
    session?.accessToken,
  );

  useEffect(() => {
    if (uploadedId) onChange(uploadedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ phản ứng khi CHÍNH uploadedId đổi, onChange là setter ổn định từ setForm/onPatch.
  }, [uploadedId]);

  useEffect(() => {
    onUploadingChange?.(uploading);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ phản ứng khi CHÍNH uploading đổi, onUploadingChange là callback ổn định từ form cha.
  }, [uploading]);

  useEffect(() => {
    // Dọn khoá khi picker này biến mất (vd. xoá khối) trong lúc đang tải — nếu không, nút Lưu bị
    // khoá vĩnh viễn dù không còn picker nào thực sự đang tải.
    return () => onUploadingChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy lúc unmount.
  }, []);

  const displayUrl = preview ?? (needsInternalPreview ? internal.src : existingImageUrl) ?? null;

  return (
    <div>
      {displayUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- runtime-resolved media host / blob: URL tạm, cùng precedent PlaceCard.tsx
        <img
          src={displayUrl}
          alt=""
          style={{ maxWidth: 200, maxHeight: 140, display: 'block', marginBottom: '0.4rem', borderRadius: 4, objectFit: 'cover' }}
        />
      )}
      {needsInternalPreview && !internal.src && !internal.loading && (
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 0.4rem' }}>
          Chưa xem trước được ảnh này (cần quyền xem nội bộ hoặc phiên đăng nhập đã hết hạn).
        </p>
      )}
      <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.25rem' }}>{label}</label>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onFileSelected}
        disabled={uploading}
        aria-label={label}
      />
      {uploading && (
        <p role="status" style={{ color: 'var(--muted)', margin: '0.25rem 0 0' }}>
          Đang tải ảnh lên…
        </p>
      )}
      {error && (
        <p role="alert" style={{ color: 'var(--err, red)', margin: '0.25rem 0 0' }}>
          {error}
        </p>
      )}
      {mediaId && !uploading && !error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            {preview && uploadedId === mediaId
              ? 'Ảnh vừa tải xong — sẽ vào hàng chờ duyệt khi bạn lưu bản nháp.'
              : mediaStatus === 'pending'
                ? 'Ảnh đã chọn — đang chờ duyệt.'
                : mediaStatus === 'rejected'
                  ? 'Ảnh đã chọn — đã bị từ chối, chọn ảnh khác.'
                  : mediaStatus === 'hidden'
                    ? 'Ảnh đã chọn — đang bị ẩn.'
                    : 'Đã chọn ảnh.'}
          </span>
          {mediaStatus === 'pending' && (
            <Link href="/dashboard/moderation" style={{ fontSize: '0.8rem' }}>
              Hàng chờ kiểm duyệt →
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              reset();
              onChange('');
            }}
            style={{ fontSize: '0.8rem' }}
          >
            Gỡ ảnh
          </button>
        </div>
      )}
    </div>
  );
}
