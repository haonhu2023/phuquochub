'use client';

import { useEffect } from 'react';
import { useSingleImageUpload } from '@/modules/media/useSingleImageUpload';

interface Props {
  mediaId: string;
  /** URL đã resolve của `mediaId` hiện tại (từ `heroImageUrl`/block `content.imageUrl` — backend
   *  đã tính sẵn, xem GuideArticlesService.resolveImageBlockContent). `null` khi chưa chọn ảnh
   *  nào, hoặc khi mediaId vừa đổi qua một lần upload mới (preview cục bộ thay thế nó). */
  existingImageUrl?: string | null;
  onChange: (mediaId: string) => void;
  label: string;
}

// G-C (2026-09-22) — thay ô nhập UUID thô bằng chọn ảnh THẬT: chọn file → tải lên → xem trước
// ngay, KHÔNG còn phải tự tay copy một UUID từ nơi khác. Dùng lại NGUYÊN VẸN
// `useSingleImageUpload` (đường ống presign→PUT→register mồ côi đã có sẵn cho ảnh review) — không
// có "thư viện media" để duyệt lại ảnh cũ (ngoài phạm vi, xem §Ngoài phạm vi của kế hoạch: không
// page builder/media library mới); mỗi lần chọn là một upload mới, đúng cách owner-decision-queue
// và moderation đã quen (ảnh mới luôn vào `pending`, cần published trước khi publish() chấp nhận —
// assertMediaPublishEligible đã cưỡng chế điều đó, component này không cần lặp lại kiểm tra đó).
export function GuideMediaPicker({ mediaId, existingImageUrl, onChange, label }: Props) {
  const { preview, mediaId: uploadedId, uploading, error, onFileSelected, reset } = useSingleImageUpload();

  useEffect(() => {
    if (uploadedId) onChange(uploadedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ phản ứng khi CHÍNH uploadedId đổi, onChange là setter ổn định từ setForm/onPatch.
  }, [uploadedId]);

  const displayUrl = preview ?? existingImageUrl ?? null;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Đã chọn ảnh.</span>
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
