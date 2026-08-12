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
  reorderPlacePhotos,
  setPlacePhotoCover,
  updatePlacePhotoMetadata,
} from './api/place-photos.api';
import { PhotoMetadataForm, type PhotoMetadataInput } from './PhotoMetadataForm';
import { canBeCover, placePhotoStatusLabel, type PlacePhoto } from './types';
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
 * Lỗi của hai thao tác quản lý gallery. Tách khỏi `uploadErrorMessage` vì cùng một mã trạng thái
 * mang ý nghĩa khác hẳn ở đây (vd 422 = "ảnh chưa được duyệt", không phải lỗi tệp tải lên).
 */
function galleryErrorMessage(err: unknown, action: 'order' | 'cover'): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Bạn không có quyền quản lý ảnh của cơ sở này.';
    if (err.status === 404) return 'Không tìm thấy ảnh này. Vui lòng tải lại trang.';
    if (err.status === 422) {
      return action === 'cover'
        ? 'Chỉ ảnh đã được kiểm duyệt viên duyệt mới đặt được làm ảnh bìa.'
        : 'Danh sách ảnh đã thay đổi. Vui lòng tải lại trang rồi thử lại.';
    }
    if (err.status === 429) return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.';
    if (err.status < 500) return err.message;
  }
  return action === 'cover'
    ? 'Không đặt được ảnh bìa. Vui lòng thử lại.'
    : 'Không lưu được thứ tự ảnh. Vui lòng thử lại.';
}

/** Đổi chỗ ảnh ở `index` với ảnh liền kề. Trả về `null` nếu đã ở biên (không có gì để đổi). */
function swapped(photos: PlacePhoto[], index: number, direction: -1 | 1): PlacePhoto[] | null {
  const target = index + direction;
  if (target < 0 || target >= photos.length) return null;
  const next = [...photos];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
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
  // Một cờ DUY NHẤT cho cả sắp xếp lẫn đặt bìa: hai thao tác cùng ghi lên một tài nguyên (thứ tự
  // gallery), nên cho chạy song song sẽ khiến hai response ghi đè nhau và giao diện nhấp nháy về
  // trạng thái cũ. Trong lúc chờ, MỌI nút của gallery bị vô hiệu hoá.
  const [busy, setBusy] = useState(false);
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

  /**
   * Lưu NGAY mỗi lần bấm Lên/Xuống thay vì gom lại chờ nút "Lưu": không có trạng thái "đã đổi
   * nhưng chưa lưu" để người dùng mất khi rời trang, và server luôn là nguồn sự thật của thứ tự.
   * Danh sách gửi đi là TOÀN BỘ ảnh đang hiển thị (đúng hợp đồng của endpoint).
   */
  async function onMove(index: number, direction: -1 | 1) {
    if (state.kind !== 'ready' || busy) return;
    const next = swapped(state.photos, index, direction);
    if (!next) return;

    const session = readSession();
    if (!session) {
      setUploadError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    setUploadError(null);
    setNotice(null);
    setBusy(true);
    try {
      const photos = await reorderPlacePhotos(placeId, next.map((p) => p.id), session.accessToken);
      setState({ kind: 'ready', photos });
      setNotice('Đã lưu thứ tự ảnh.');
    } catch (err) {
      // KHÔNG áp thứ tự mới vào giao diện khi lưu thất bại — hiển thị đúng thứ tự server đang giữ.
      setUploadError(galleryErrorMessage(err, 'order'));
    } finally {
      setBusy(false);
    }
  }

  async function onSetCover(photo: PlacePhoto) {
    if (busy) return;

    const session = readSession();
    if (!session) {
      setUploadError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    setUploadError(null);
    setNotice(null);
    setBusy(true);
    try {
      const photos = await setPlacePhotoCover(placeId, photo.id, session.accessToken);
      setState({ kind: 'ready', photos });
      setNotice('Đã đặt ảnh bìa.');
    } catch (err) {
      setUploadError(galleryErrorMessage(err, 'cover'));
    } finally {
      setBusy(false);
    }
  }

  /**
   * `throw` (không phải setUploadError+return) khi thiếu phiên: `PhotoMetadataForm` tự bắt lỗi
   * trong `try/catch` của chính nó và hiển thị NGAY DƯỚI form đó — đúng vị trí người dùng đang
   * thao tác, không phải banner chung ở đầu trang (cùng khuôn `ContactsView.handleUpdate`).
   */
  async function handleMetadataSave(photo: PlacePhoto, input: PhotoMetadataInput) {
    const session = readSession();
    if (!session) {
      throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }
    const photos = await updatePlacePhotoMetadata(placeId, photo.id, input, session.accessToken);
    setState({ kind: 'ready', photos });
  }

  async function onDelete(photo: PlacePhoto) {
    if (deletingId || busy) return;
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
        <>
          <p className={styles.orderHint}>
            Ảnh hiển thị trên trang cơ sở theo đúng thứ tự dưới đây. Dùng nút “Lên”/“Xuống” để sắp
            lại — thay đổi được lưu ngay.
          </p>
          {busy && (
            <p className={styles.uploadStatus} role="status">
              Đang lưu…
            </p>
          )}
          <ul className={styles.grid}>
            {state.photos.map((photo, index) => (
              <li key={photo.id} className={`${styles.tile} ${photo.is_cover ? styles.tileCover : ''}`}>
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
                  {photo.is_cover && <span className={styles.coverBadge}>Ảnh bìa</span>}
                  {photo.status === 'pending' && (
                    <span className={styles.tileHint}>
                      Chưa hiển thị công khai. Ảnh phải được duyệt trước khi làm ảnh bìa.
                    </span>
                  )}
                  {photo.status === 'rejected' && (
                    <span className={styles.tileHint}>
                      Kiểm duyệt viên đã từ chối ảnh này. Ảnh không hiển thị công khai và không làm
                      ảnh bìa được.
                    </span>
                  )}
                  {photo.status === 'hidden' && (
                    <span className={styles.tileHint}>
                      Ảnh đang bị ẩn nên không hiển thị công khai và không làm ảnh bìa được.
                    </span>
                  )}

                  {/* Sửa mô tả/alt text KHÔNG làm ảnh xuất hiện công khai — trạng thái ở trên vẫn
                      là nguồn sự thật duy nhất về việc ảnh đã lên trang hay chưa. */}
                  <PhotoMetadataForm photo={photo} onSubmit={(input) => handleMetadataSave(photo, input)} />

                  {/* `aria-label` nêu rõ vị trí để người dùng trình đọc màn hình biết mình đang di
                      chuyển ảnh nào — chỉ nhãn "Lên"/"Xuống" thì mọi nút nghe giống hệt nhau. */}
                  <div className={styles.tileActions}>
                    <button
                      type="button"
                      className={styles.orderBtn}
                      onClick={() => onMove(index, -1)}
                      disabled={busy || index === 0}
                      aria-label={`Di chuyển ảnh ${index + 1} lên trước`}
                    >
                      ↑ Lên
                    </button>
                    <button
                      type="button"
                      className={styles.orderBtn}
                      onClick={() => onMove(index, 1)}
                      disabled={busy || index === state.photos.length - 1}
                      aria-label={`Di chuyển ảnh ${index + 1} xuống sau`}
                    >
                      ↓ Xuống
                    </button>
                  </div>

                  {canBeCover(photo) && (
                    <button
                      type="button"
                      className={styles.coverBtn}
                      onClick={() => onSetCover(photo)}
                      disabled={busy}
                    >
                      Đặt làm ảnh bìa
                    </button>
                  )}

                  <button
                    type="button"
                    className={placeMgmtStyles.archiveBtn}
                    onClick={() => onDelete(photo)}
                    disabled={busy || deletingId === photo.id}
                  >
                    {deletingId === photo.id ? 'Đang gỡ…' : 'Gỡ ảnh'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
