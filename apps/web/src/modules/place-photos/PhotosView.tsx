'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { runImageUpload, UploadValidationError } from '@/modules/media/uploadPipeline';
import placeStyles from '@/modules/places/places.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';
import {
  deletePlacePhoto,
  listPlacePhotos,
  presignPlacePhoto,
  registerPlacePhoto,
} from './api/place-photos.api';
import { placePhotoStatusLabel, type PlacePhoto } from './types';
import styles from './place-photos.module.css';

interface Props {
  placeId: string;
}

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; photos: PlacePhoto[] };

function statusClass(status: PlacePhoto['status']): string {
  switch (status) {
    case 'published':
      return placeMgmtStyles.statusPublished;
    case 'rejected':
    case 'hidden':
      return placeMgmtStyles.statusArchived;
    default:
      return placeMgmtStyles.statusPending;
  }
}

function uploadErrorMessage(err: unknown): string {
  if (err instanceof UploadValidationError) return err.message;
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Bạn không có quyền đăng ảnh cho cơ sở này.';
    if (err.status === 409) return 'Ảnh này bạn đã tải lên trước đó.';
    if (err.status === 429) return 'Bạn đang tải lên quá nhanh. Vui lòng thử lại sau ít phút.';
    if (err.status < 500) return err.message;
  }
  return 'Không tải được ảnh lên. Vui lòng thử lại.';
}

/**
 * Quản lý ảnh của cơ sở (chủ/quản lý cơ sở).
 *
 * Ảnh KHÔNG BAO GIỜ tự hiển thị công khai: mỗi ảnh vừa tải lên ở trạng thái "Đang chờ duyệt" cho
 * tới khi kiểm duyệt viên duyệt. Giao diện nói rõ điều đó ngay tại chỗ, để chủ cơ sở không hiểu
 * nhầm là ảnh đã lên trang.
 *
 * Ảnh chưa duyệt không có URL công khai, nên `img.src` trỏ tới kênh nội bộ theo cơ sở
 * (`/places/{id}/media/{mediaId}/file`) — endpoint đó tự kiểm tra quyền mỗi lần tải.
 */
export function PhotosView({ placeId }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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
        if (!cancelled) setState({ kind: 'loading' });
        return listPlacePhotos(placeId, session.accessToken);
      })
      .then((photos) => {
        if (!cancelled) setState({ kind: 'ready', photos });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) {
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
  }, [placeId, reloadKey]);

  async function onFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // cho phép chọn lại đúng file cũ sau khi lỗi
    if (!file || uploading) return; // `uploading` chặn gửi trùng khi bấm nhanh nhiều lần

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
        presign: (input) => presignPlacePhoto(placeId, input, session.accessToken),
        register: (key) => registerPlacePhoto(placeId, key, session.accessToken),
      });
      setNotice('Đã gửi ảnh. Ảnh sẽ hiển thị công khai sau khi được kiểm duyệt viên duyệt.');
      reload();
    } catch (err) {
      setUploadError(uploadErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(photo: PlacePhoto) {
    if (deletingId) return;
    if (!window.confirm('Gỡ ảnh này khỏi cơ sở? Ảnh sẽ không còn hiển thị ở bất kỳ đâu.')) return;

    const session = readSession();
    if (!session) {
      setUploadError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    setUploadError(null);
    setNotice(null);
    setDeletingId(photo.id);
    try {
      await deletePlacePhoto(placeId, photo.id, session.accessToken);
      setNotice('Đã gỡ ảnh.');
      reload();
    } catch (err) {
      setUploadError(uploadErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main>
      <nav className={placeStyles.breadcrumb} aria-label="Breadcrumb">
        <Link href="/dashboard/places">Địa điểm của tôi</Link>
        <span className={placeStyles.sep}>/</span>
        <Link href={`/dashboard/places/${placeId}/edit`}>Chỉnh sửa</Link>
        <span className={placeStyles.sep}>/</span>
        <span aria-current="page">Ảnh</span>
      </nav>

      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Ảnh của cơ sở</h1>
        <p className={placeStyles.pageLede}>
          Ảnh bạn tải lên sẽ được kiểm duyệt trước khi hiển thị công khai trên trang cơ sở.
        </p>
      </header>

      {state.kind === 'signed-out' && (
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Cần đăng nhập</p>
          <p>Đăng nhập để quản lý ảnh của cơ sở.</p>
          <Link
            href={`/login?next=${encodeURIComponent(`/dashboard/places/${placeId}/photos`)}`}
            className={placeStyles.btn}
          >
            Đăng nhập
          </Link>
        </div>
      )}

      {state.kind === 'forbidden' && (
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không có quyền truy cập</p>
          <p>Bạn không có quyền quản lý ảnh của cơ sở này.</p>
          <Link href="/dashboard/places" className={placeStyles.btn}>
            ← Về danh sách địa điểm
          </Link>
        </div>
      )}

      {(state.kind === 'ready' || state.kind === 'loading') && (
        <section className={placeMgmtStyles.section}>
          <h2 className={placeMgmtStyles.sectionTitle}>Tải ảnh lên</h2>
          <p className={styles.uploadHint}>Định dạng JPEG, PNG hoặc WebP. Dung lượng tối đa 10MB.</p>

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
        <div className={styles.grid} aria-busy="true" aria-label="Đang tải ảnh của cơ sở">
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
          <p>Tải ảnh đầu tiên lên để giới thiệu cơ sở của bạn.</p>
        </div>
      )}

      {state.kind === 'ready' && state.photos.length > 0 && (
        <ul className={styles.grid}>
          {state.photos.map((photo) => (
            <li key={photo.id} className={styles.tile}>
              {/* eslint-disable-next-line @next/next/no-img-element -- ảnh phục vụ qua redirect có ký từ object storage; next/image cần remotePatterns (ngoài phạm vi). */}
              <img
                className={styles.thumb}
                src={photo.url}
                alt={photo.alt_text ?? photo.caption ?? 'Ảnh của cơ sở'}
                loading="lazy"
              />
              <div className={styles.tileBody}>
                <span className={`${placeMgmtStyles.statusBadge} ${statusClass(photo.status)}`}>
                  {placePhotoStatusLabel(photo.status)}
                </span>
                {photo.status === 'pending' && (
                  <span className={styles.tileHint}>Chưa hiển thị công khai.</span>
                )}
                {photo.status === 'rejected' && (
                  <span className={styles.tileHint}>Kiểm duyệt viên đã từ chối ảnh này.</span>
                )}
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
    </main>
  );
}
