'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { listCategories, type Category } from '@/modules/categories/api/categories.api';
import placeStyles from '@/modules/places/places.module.css';
import { listMyPlaces, archivePlace } from './api/place-management.api';
import { placeStatusLabel } from './statusLabels';
import type { ManagedPlace } from './types';
import styles from './place-management.module.css';

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; places: ManagedPlace[] };

function statusClass(status: ManagedPlace['status']): string {
  switch (status) {
    case 'published':
      return styles.statusPublished;
    case 'archived':
      return styles.statusArchived;
    default:
      return styles.statusPending;
  }
}

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function categoryLabel(place: ManagedPlace, categories: Category[] | null): string {
  return categories?.find((c) => c.id === place.category_id)?.name_vi ?? place.category_slug ?? '—';
}

function archiveErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) {
      return 'Bạn không có quyền lưu trữ địa điểm này — hiện chỉ kiểm duyệt viên mới thực hiện được thao tác này.';
    }
    if (err.status === 404) return 'Địa điểm không còn tồn tại.';
    if (err.status < 500) return err.message;
  }
  return 'Không lưu trữ được địa điểm. Vui lòng thử lại.';
}

// "Địa điểm của tôi" (PLACE-041) — danh sách business_id mà user hiện tại có quyền quản lý
// (GET /places/mine, tự lọc theo grant Place.Edit.Managed của người gọi — KHÔNG có tham số lọc
// theo user nào ở phía client). CÙNG khuôn ModerationQueueView: đọc session, gọi API xác thực,
// forbidden/error/empty/ready.
export function MyPlacesView() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  useEffect(() => {
    listCategories()
      .then(setCategories)
      .catch(() => setCategories(null));
  }, []);

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
        return listMyPlaces(session.accessToken);
      })
      .then((places) => {
        if (!cancelled) setState({ kind: 'ready', places });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiError && err.status < 500 ? err.message : 'Đã xảy ra lỗi khi tải danh sách địa điểm. Vui lòng thử lại.';
        setState({ kind: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function handleArchive(place: ManagedPlace) {
    if (archivingId) return;
    const confirmed = window.confirm(
      `Lưu trữ "${place.name}"? Địa điểm sẽ không còn hiển thị công khai. Thao tác này không thể tự hoàn tác từ giao diện.`,
    );
    if (!confirmed) return;

    const session = readSession();
    if (!session) {
      setArchiveError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    setArchiveError(null);
    setArchivingId(place.id);
    try {
      await archivePlace(place.id, session.accessToken);
      reload();
    } catch (err) {
      setArchiveError(archiveErrorMessage(err));
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Địa điểm của tôi</h1>
        <p className={placeStyles.pageLede}>
          Các địa điểm bạn đang có quyền quản lý (thông qua xác nhận sở hữu cơ sở đã được duyệt).
        </p>
      </header>

      <div className={styles.actions}>
        <Link href="/dashboard/places/new" className={styles.submitBtn}>
          + Thêm địa điểm
        </Link>
      </div>

      {archiveError && (
        <p className={styles.alert} role="alert" style={{ marginTop: '1rem' }}>
          {archiveError}
        </p>
      )}

      {state.kind === 'signed-out' && (
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Cần đăng nhập</p>
          <p>Đăng nhập để xem và quản lý địa điểm của bạn.</p>
          <Link href="/login?next=/dashboard/places" className={placeStyles.btn}>
            Đăng nhập
          </Link>
        </div>
      )}

      {state.kind === 'loading' && (
        <div className={styles.list} aria-busy="true" aria-label="Đang tải địa điểm của tôi">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={styles.skelRow} />
          ))}
        </div>
      )}

      {state.kind === 'error' && (
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không tải được danh sách</p>
          <p>{state.message}</p>
          <button type="button" className={placeStyles.btn} onClick={reload}>
            Thử lại
          </button>
        </div>
      )}

      {state.kind === 'ready' && state.places.length === 0 && (
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>Chưa có địa điểm nào</p>
          <p>
            Bạn chưa quản lý địa điểm nào. Nếu cơ sở của bạn đã có trên PhuQuocHub, hãy tạo mới hoặc
            liên hệ quản trị viên để được xác nhận quyền quản lý.
          </p>
          <Link href="/dashboard/places/new" className={placeStyles.btn}>
            + Thêm địa điểm
          </Link>
        </div>
      )}

      {state.kind === 'ready' && state.places.length > 0 && (
        <div className={styles.list}>
          {state.places.map((place) => (
            <div key={place.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>{place.name}</span>
                <div className={styles.rowMeta}>
                  <span className={`${styles.statusBadge} ${statusClass(place.status)}`}>
                    {placeStatusLabel(place.status)}
                  </span>
                  <span>{categoryLabel(place, categories)}</span>
                  {place.ward && <span>{place.ward}</span>}
                  <span>Cập nhật {formatUpdatedAt(place.updated_at)}</span>
                </div>
              </div>
              <div className={styles.rowActions}>
                <Link href={`/dashboard/places/${place.id}/edit`} className={placeStyles.btn}>
                  Sửa
                </Link>
                <button
                  type="button"
                  className={styles.archiveBtn}
                  onClick={() => handleArchive(place)}
                  disabled={archivingId === place.id}
                >
                  {archivingId === place.id ? 'Đang lưu trữ…' : 'Lưu trữ'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
