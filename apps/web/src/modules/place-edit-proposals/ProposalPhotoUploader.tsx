'use client';

import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { runImageUpload, UploadValidationError } from '@/modules/media/uploadPipeline';
import { useAuthenticatedImage } from '@/modules/media/useAuthenticatedImage';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';
import { listMyProposalPhotos, presignProposalPhoto, registerProposalPhoto } from './api/place-edit-proposal-photos.api';
import type { PlaceEditProposalPhoto } from './types';

const MAX_PROPOSAL_PHOTOS = 3;

interface Props {
  proposalId: string;
}

function uploadErrorMessage(err: unknown): string {
  if (err instanceof UploadValidationError) return err.message;
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Bạn không có quyền gắn ảnh cho đề xuất này.';
    if (err.status === 404) return 'Không tìm thấy đề xuất này — có thể đã bị xoá.';
    if (err.status === 409) return err.message;
    if (err.status === 429) return 'Bạn đang tải lên quá nhanh. Vui lòng thử lại sau ít phút.';
    if (err.status < 500) return err.message;
  }
  return 'Không tải được ảnh lên. Vui lòng thử lại.';
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Đang chờ duyệt',
  published: 'Đã duyệt',
  rejected: 'Bị từ chối',
  hidden: 'Đang bị ẩn',
};

/** Xuất CÔNG KHAI — tái dùng ở màn hình duyệt của moderator (PlaceEditProposalsQueueView) để
 * hiện CÙNG một thumbnail (qua kênh moderation-file thay vì kênh của người gửi, url đã đúng vì
 * backend tự chọn kênh theo đối tượng xem — component không cần biết sự khác biệt đó). */
export function ProposalPhotoThumbnail({ photo, accessToken }: { photo: PlaceEditProposalPhoto; accessToken: string }) {
  const { src, loading, error } = useAuthenticatedImage(photo.url, accessToken);
  const boxStyle = { width: 96, height: 72, borderRadius: 'var(--radius)', border: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={boxStyle} aria-busy={loading}>
        {!loading && !error && src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="Ảnh bằng chứng đính kèm góp ý" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
      </div>
      <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{STATUS_LABELS[photo.status] ?? photo.status}</span>
    </div>
  );
}

/**
 * "Ảnh góp ý qua media moderation" (mục V đợt 2) — gắn ảnh BẰNG CHỨNG cho MỘT đề xuất đã tồn tại
 * (mounted ngay sau khi gửi thành công, xem ProposeEditView). Ảnh LUÔN vào hàng chờ kiểm duyệt
 * chung, không bao giờ tự công khai — nhãn trạng thái nói rõ để người gửi không hiểu nhầm.
 *
 * Tái dùng `runImageUpload()`/`useAuthenticatedImage` dùng chung (modules/media) — CÙNG đường ống
 * đã dùng cho ảnh cơ sở/bất động sản, không viết lại.
 */
export function ProposalPhotoUploader({ proposalId }: Props) {
  const [photos, setPhotos] = useState<PlaceEditProposalPhoto[] | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    const session = readSession();
    if (!session) return;
    let cancelled = false;
    // setState đẩy ra khỏi thân effect (qua microtask) — cùng quy ước RealEstateListingPhotosManager/
    // PlacePhotosManager: gọi setState ĐỒNG BỘ ngay trong effect gây cascading render không cần thiết.
    void Promise.resolve().then(() => {
      if (!cancelled) setAccessToken(session.accessToken);
    });
    listMyProposalPhotos(proposalId, session.accessToken)
      .then((items) => {
        if (!cancelled) setPhotos(items);
      })
      .catch(() => {
        if (!cancelled) setPhotos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [proposalId, reloadKey]);

  async function onFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || uploading) return;
    if (photos && photos.length >= MAX_PROPOSAL_PHOTOS) {
      setError(`Tối đa ${MAX_PROPOSAL_PHOTOS} ảnh mỗi góp ý.`);
      return;
    }

    const session = readSession();
    if (!session) {
      setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    setError(null);
    setNotice(null);
    setUploading(true);
    try {
      await runImageUpload(file, {
        presign: (input) => presignProposalPhoto(proposalId, input, session.accessToken),
        register: (key) => registerProposalPhoto(proposalId, key, session.accessToken),
      });
      setNotice('Đã gửi ảnh — ảnh sẽ hiển thị sau khi được kiểm duyệt viên duyệt.');
      reload();
    } catch (err) {
      setError(uploadErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  if (photos === null) return null;

  return (
    <section style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
      <p style={{ fontWeight: 600, margin: '0 0 0.35rem' }}>Ảnh bằng chứng (không bắt buộc)</p>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0 0 0.6rem' }}>
        Gửi kèm ảnh chụp minh chứng cho góp ý của bạn (vd biển giờ mở cửa mới). Ảnh qua kiểm duyệt
        trước khi hiển thị cho kiểm duyệt viên xem — tối đa {MAX_PROPOSAL_PHOTOS} ảnh.
      </p>

      {photos.length > 0 && accessToken && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.6rem' }}>
          {photos.map((p) => (
            <ProposalPhotoThumbnail key={p.id} photo={p} accessToken={accessToken} />
          ))}
        </div>
      )}

      {photos.length < MAX_PROPOSAL_PHOTOS && (
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onFileSelected}
          disabled={uploading}
          aria-label="Chọn ảnh bằng chứng để tải lên"
        />
      )}
      {uploading && <p role="status" style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Đang tải ảnh lên…</p>}
      {error && <p className={placeMgmtStyles.alert} role="alert">{error}</p>}
      {notice && <p className={placeMgmtStyles.success} role="status">{notice}</p>}
    </section>
  );
}
