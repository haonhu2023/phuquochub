'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { fetchCapabilities } from '@/modules/auth/api/me.api';
import {
  listEditorialPlaces,
  publishPlace,
  unpublishPlace,
} from '@/modules/place-management/api/place-management.api';
import { placeStatusClassKey, placeStatusLabel } from '@/modules/place-management/statusLabels';
import type { PlaceCard } from '@phuquochub/shared-types';
import placeStyles from '@/modules/places/places.module.css';
import placeManagementStyles from '@/modules/place-management/place-management.module.css';

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; places: PlaceCard[] };

function actionErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
    if (err.status === 404) return 'Địa điểm không còn tồn tại.';
    if (err.status < 500) return err.message;
  }
  return 'Thao tác thất bại. Vui lòng thử lại.';
}

/**
 * Danh sách địa điểm cho ĐỘI VẬN HÀNH (Operator Bootstrap & Editorial Place Content, 2026-08-12;
 * mở rộng P1 Owner self-publish 2026-09-22).
 *
 * Nguồn dữ liệu đổi từ `GET /places` công khai (chỉ `published`) sang `GET /places/editorial`
 * (đặc quyền, `Place.Edit.Any`, MỌI status) — đây chính là màn "tìm thấy" duy nhất cho
 * content_owner/biên tập viên toàn cục: `GET /places/mine` chỉ liệt kê grant scope='managed' có
 * business_id cụ thể, nên một place họ VỪA TẠO (`draft`, chưa ai giao quản lý) không bao giờ xuất
 * hiện ở đó — không có màn này thì họ tạo xong sẽ không tìm lại được để xuất bản.
 */
export function EditorialPlacesView() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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

    void fetchCapabilities(session.accessToken)
      .then((caps) => {
        if (cancelled) return null;
        if (!caps.canEditorial) {
          setState({ kind: 'forbidden' });
          return null;
        }
        return listEditorialPlaces(session.accessToken, { limit: 50 });
      })
      .then((res) => {
        if (cancelled || res === null) return;
        setState({ kind: 'ready', places: res.data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) {
          setState({ kind: 'forbidden' });
          return;
        }
        setState({ kind: 'error', message: 'Không tải được danh sách địa điểm. Vui lòng thử lại.' });
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function handlePublish(place: PlaceCard) {
    const session = readSession();
    if (!session || busyId) return;
    setBusyId(place.id);
    setActionError(null);
    try {
      await publishPlace(place.id, session.accessToken);
      reload();
    } catch (err) {
      setActionError(actionErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleUnpublish(place: PlaceCard) {
    const session = readSession();
    if (!session || busyId) return;
    const confirmed = window.confirm(
      `Gỡ công khai "${place.name}"? Có thể xuất bản lại bất cứ lúc nào.`,
    );
    if (!confirmed) return;
    setBusyId(place.id);
    setActionError(null);
    try {
      await unpublishPlace(place.id, session.accessToken);
      reload();
    } catch (err) {
      setActionError(actionErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main>
      <nav className={placeStyles.breadcrumb} aria-label="Breadcrumb">
        <Link href="/dashboard">Bảng điều khiển</Link>
        <span className={placeStyles.sep}>/</span>
        <span aria-current="page">Biên tập nội dung</span>
      </nav>

      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Biên tập nội dung địa điểm</h1>
        <p className={placeStyles.pageLede}>
          Mọi địa điểm — kể cả bản nháp và đang chờ duyệt. Xuất bản, gỡ công khai, bổ sung ảnh và
          thông tin liên hệ.
        </p>
      </header>

      {actionError && (
        <p className={placeManagementStyles.alert} role="alert" style={{ marginTop: '1rem' }}>
          {actionError}
        </p>
      )}

      {state.kind === 'signed-out' && (
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Cần đăng nhập</p>
          <Link href="/login?next=%2Fdashboard%2Feditorial%2Fplaces" className={placeStyles.btn}>
            Đăng nhập
          </Link>
        </div>
      )}

      {state.kind === 'forbidden' && (
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không có quyền truy cập</p>
          <p>Khu vực này dành cho đội biên tập nội dung của PhuQuocHub.</p>
          <Link href="/dashboard" className={placeStyles.btn}>
            ← Về bảng điều khiển
          </Link>
        </div>
      )}

      {state.kind === 'loading' && <p role="status">Đang tải danh sách địa điểm…</p>}

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
        <p className={placeStyles.stateTitle}>Chưa có địa điểm nào.</p>
      )}

      {state.kind === 'ready' && state.places.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {state.places.map((p) => (
            <li key={p.id} style={{ padding: '0.6rem 0', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
              <span className={`${placeManagementStyles.statusBadge} ${placeManagementStyles[placeStatusClassKey(p.status)]}`}>
                {placeStatusLabel(p.status)}
              </span>{' '}
              <strong>{p.name}</strong>
              {!p.cover_image_url && (
                <span style={{ marginLeft: 8, color: 'var(--muted)' }}>· chưa có ảnh bìa</span>
              )}
              <div style={{ marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <Link href={`/dashboard/places/${p.id}/edit`}>Sửa →</Link>
                <Link href={`/dashboard/places/${p.id}/photos`}>Quản lý ảnh →</Link>
                <Link href={`/dashboard/places/${p.id}/preview`}>Xem trước →</Link>
                {p.status === 'published' ? (
                  <Link href={`/places/${p.slug}`} target="_blank">
                    Xem trang công khai →
                  </Link>
                ) : (
                  <button
                    type="button"
                    className={placeStyles.btn}
                    onClick={() => handlePublish(p)}
                    disabled={busyId === p.id}
                  >
                    {busyId === p.id ? 'Đang xuất bản…' : 'Xuất bản'}
                  </button>
                )}
                {p.status === 'published' && (
                  <button
                    type="button"
                    className={placeManagementStyles.archiveBtn}
                    onClick={() => handleUnpublish(p)}
                    disabled={busyId === p.id}
                  >
                    {busyId === p.id ? 'Đang gỡ…' : 'Gỡ công khai'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
