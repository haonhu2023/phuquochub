'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { runImageUpload, UploadValidationError } from '@/modules/media/uploadPipeline';
import placeStyles from '@/modules/places/places.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';
import {
  deleteRealEstateListingPhoto,
  listMyRealEstateListingPhotos,
  presignRealEstateListingPhoto,
  registerRealEstateListingPhoto,
} from './api/real-estate-listing-photos.api';
import { RealEstateListingPhotoThumbnail } from './RealEstateListingPhotoThumbnail';
import { MAX_REAL_ESTATE_LISTING_PHOTOS, type RealEstateListingPhoto } from './types';
import styles from './real-estate-listing-photos.module.css';

interface Props {
  listingId: string;
}

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; photos: RealEstateListingPhoto[] };

function uploadErrorMessage(err: unknown): string {
  if (err instanceof UploadValidationError) return err.message;
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Bạn không có quyền quản lý ảnh của tin này.';
    if (err.status === 409) return err.message; // "Đã đủ 10 ảnh" / trùng checksum.
    if (err.status === 422) return err.message; // Xác thực object thất bại, hoặc ảnh có GPS EXIF.
    if (err.status === 429) return 'Bạn đang tải lên quá nhanh. Vui lòng thử lại sau ít phút.';
    if (err.status < 500) return err.message;
  }
  return 'Không tải được ảnh lên. Vui lòng thử lại.';
}

/**
 * "Ảnh cho bất động sản" (mục V đợt 4) — màn hình quản lý CỦA CHỦ TIN, mounted trong form sửa tin
 * (`RealEstateListingForm`/`EditRealEstateListingView`). Không có sắp xếp/ảnh bìa/kiểm duyệt ảnh
 * riêng (khác `PlacePhotosManager`) — tin bất động sản có vòng đời duyệt của CHÍNH nó, ảnh không
 * cần một lớp duyệt thứ hai; thứ tự hiển thị đơn giản là thứ tự tải lên.
 *
 * Thông điệp lỗi 422 "ảnh có GPS EXIF" đến thẳng từ backend (RealEstateListingPhotosService) khi
 * tin đang hiển thị khu vực chung (address_precision != 'exact') — không có logic client nào lặp
 * lại phép kiểm đó, tránh hai nguồn sự thật có thể lệch nhau.
 */
export function RealEstateListingPhotosManager({ listingId }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    const session = readSession();
    let cancelled = false;

    if (!session) {
      void Promise.resolve().then(() => {
        if (!cancelled) setState({ kind: 'signed-out' });
      });
      return () => {
        cancelled = true;
      };
    }

    void Promise.resolve()
      .then(() => {
        if (!cancelled) {
          setState({ kind: 'loading' });
          setAccessToken(session.accessToken);
        }
        return listMyRealEstateListingPhotos(listingId, session.accessToken);
      })
      .then((photos) => {
        if (!cancelled) setState({ kind: 'ready', photos });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
          setState({ kind: 'forbidden' });
          return;
        }
        const message =
          err instanceof ApiError && err.status < 500
            ? err.message
            : 'Đã xảy ra lỗi khi tải danh sách ảnh. Vui lòng thử lại.';
        setState({ kind: 'error', message });
      });

    return () => {
      cancelled = true;
    };
  }, [listingId, reloadKey]);

  async function onFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || uploading) return;
    if (state.kind === 'ready' && state.photos.length >= MAX_REAL_ESTATE_LISTING_PHOTOS) {
      setUploadError(`Tối đa ${MAX_REAL_ESTATE_LISTING_PHOTOS} ảnh mỗi tin — hãy xoá ảnh cũ trước khi thêm ảnh mới.`);
      return;
    }

    setUploadError(null);
    setNotice(null);

    const session = readSession();
    if (!session) {
      setUploadError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    setUploading(true);
    try {
      await runImageUpload(file, {
        presign: (input) => presignRealEstateListingPhoto(listingId, input, session.accessToken),
        register: (key) => registerRealEstateListingPhoto(listingId, key, session.accessToken),
      });
      setNotice('Đã thêm ảnh.');
      reload();
    } catch (err) {
      setUploadError(uploadErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(photo: RealEstateListingPhoto) {
    if (deletingId) return;
    if (!window.confirm('Gỡ ảnh này khỏi tin? Ảnh sẽ không còn hiển thị ở bất kỳ đâu.')) return;

    const session = readSession();
    if (!session) {
      setUploadError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    setUploadError(null);
    setNotice(null);
    setDeletingId(photo.id);
    try {
      await deleteRealEstateListingPhoto(listingId, photo.id, session.accessToken);
      setNotice('Đã gỡ ảnh.');
      reload();
    } catch (err) {
      setUploadError(uploadErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {state.kind === 'signed-out' && (
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Cần đăng nhập</p>
          <p>Đăng nhập để quản lý ảnh của tin.</p>
        </div>
      )}

      {state.kind === 'forbidden' && (
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không có quyền truy cập</p>
          <p>Bạn không có quyền quản lý ảnh của tin này.</p>
          <Link href="/dashboard/real-estate" className={placeStyles.btn}>
            ← Về danh sách tin của tôi
          </Link>
        </div>
      )}

      {(state.kind === 'ready' || state.kind === 'loading') && (
        <section className={placeMgmtStyles.section}>
          <h2 className={placeMgmtStyles.sectionTitle}>Ảnh của tin</h2>
          <p className={styles.uploadHint}>
            Định dạng JPEG, PNG hoặc WebP. Dung lượng tối đa 10MB, tối đa {MAX_REAL_ESTATE_LISTING_PHOTOS} ảnh.
            {' '}Nếu tin chỉ hiển thị khu vực chung (chưa chọn vị trí chính xác), ảnh có chứa toạ độ GPS
            (EXIF) sẽ bị từ chối — hãy tắt lưu vị trí khi chụp, hoặc đổi tin sang vị trí chính xác.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onFileSelected}
            disabled={uploading}
            aria-label="Chọn ảnh để tải lên"
            className={styles.fileInput}
          />

          {uploading && (
            <p className={styles.uploadStatus} role="status">
              Đang tải ảnh lên…
            </p>
          )}
          {uploadError && (
            <p className={placeMgmtStyles.alert} role="alert">
              {uploadError}
            </p>
          )}
          {notice && (
            <p className={placeMgmtStyles.success} role="status">
              {notice}
            </p>
          )}
        </section>
      )}

      {state.kind === 'loading' && (
        <div className={styles.grid} aria-busy="true" aria-label="Đang tải ảnh của tin">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={styles.skeletonTile} />
          ))}
        </div>
      )}

      {state.kind === 'error' && (
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không tải được danh sách ảnh</p>
          <p>{state.message}</p>
          <button type="button" className={placeStyles.btn} onClick={reload}>
            Thử lại
          </button>
        </div>
      )}

      {state.kind === 'ready' && state.photos.length === 0 && (
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>Chưa có ảnh nào</p>
          <p>Tải ảnh đầu tiên lên để giới thiệu tin của bạn.</p>
        </div>
      )}

      {state.kind === 'ready' && state.photos.length > 0 && accessToken && (
        <ul className={styles.grid}>
          {state.photos.map((photo, index) => (
            <li key={photo.id} className={styles.tile}>
              <RealEstateListingPhotoThumbnail url={photo.url} accessToken={accessToken} alt={`Ảnh ${index + 1} của tin`} />
              <div className={styles.tileBody}>
                <button
                  type="button"
                  className={placeMgmtStyles.archiveBtn}
                  onClick={() => onDelete(photo)}
                  disabled={deletingId === photo.id}
                >
                  {deletingId === photo.id ? 'Đang gỡ…' : 'Gỡ ảnh'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
