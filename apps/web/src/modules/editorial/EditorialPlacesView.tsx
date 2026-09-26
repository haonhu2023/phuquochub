'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { listCategories, type Category } from '@/modules/categories/api/categories.api';
import placeStyles from '@/modules/places/places.module.css';
import placeManagementStyles from '@/modules/place-management/place-management.module.css';
import { editorialPublicDetailHref, getEditorialCategory } from './editorialCategories';
import styles from './editorial.module.css';

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; places: PlaceCard[]; total: number; totalPages: number };

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
export function EditorialPlacesView({ initialCategory = '' }: { initialCategory?: string }) {
  const router = useRouter();
  const [category, setCategory] = useState(initialCategory);
  const [categories, setCategories] = useState<Category[]>([]);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const group = getEditorialCategory(category);

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
        void listCategories().then((items) => { if (!cancelled) setCategories(items); }).catch(() => {});
        return listEditorialPlaces(session.accessToken, { page, limit: 50, category: category || undefined });
      })
      .then((res) => {
        if (cancelled || res === null) return;
        setState({ kind: 'ready', places: res.data, total: res.meta.total, totalPages: res.meta.totalPages });
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
  }, [reloadKey, page, category]);

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
        <h1 className={placeStyles.pageTitle}>{group?.title ?? 'Biên tập nội dung địa điểm'}</h1>
        <p className={placeStyles.pageLede}>
          {group?.intro ?? 'Mọi địa điểm — kể cả bản nháp và đang chờ duyệt. Sửa thông tin, bổ sung ảnh và quản lý trạng thái xuất bản.'}
        </p>
      </header>

      {group && <aside className={styles.guidance} aria-label={`Nội dung cần có cho ${group.title}`}>
        <h2>Thông tin khách cần khi xem {group.title.toLowerCase()}</h2>
        <ul>{group.checklist.map((item) => <li key={item}>{item}</li>)}</ul>
        <p>Chỉ nhập dữ kiện đã kiểm tra. Chưa có nguồn hoặc ảnh hợp lệ thì để trống, không dùng nội dung mẫu.</p>
      </aside>}

      {group && <p><Link href={`/dashboard/places/new?category=${encodeURIComponent(category)}`} className={placeStyles.btn}>+ Thêm {group.title.toLowerCase()}</Link></p>}

      <label htmlFor="editorial-category">Loại địa điểm </label>
      <select id="editorial-category" value={category} onChange={(event) => {
        const next = event.target.value;
        setCategory(next);
        setPage(1);
        setState({ kind: 'loading' });
        router.replace(`/dashboard/editorial/places${next ? `?category=${encodeURIComponent(next)}` : ''}`);
      }}>
        <option value="">Tất cả địa điểm</option>
        {categories.map((item) => <option key={item.id} value={item.slug}>{item.name_vi}</option>)}
      </select>
      <p className={placeStyles.pageLede}>Nhà hàng, quán ăn, khách sạn, bãi biển và khu vui chơi đều được quản lý như địa điểm. Chỉnh tọa độ trong trang Sửa; xem bản đồ công khai để kiểm tra vị trí.</p>

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
        <p className={placeStyles.stateTitle}>{group ? `Chưa có ${group.title.toLowerCase()} trong danh sách.` : 'Chưa có địa điểm nào.'}</p>
      )}

      {state.kind === 'ready' && state.places.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {state.places.map((p) => (
            <li key={p.id} style={{ padding: '0.6rem 0', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
              <span className={`${placeManagementStyles.statusBadge} ${placeManagementStyles[placeStatusClassKey(p.status)]}`}>
                {placeStatusLabel(p.status)}
              </span>{' '}
              <strong>{p.name}</strong> <span>· {categories.find((c) => c.id === p.category_id)?.name_vi ?? 'Chưa phân loại'}</span>
              <div className={styles.placeSummary}>
                {p.short_description ? <span>{p.short_description}</span> : <span className={styles.missing}>Cần bổ sung mô tả ngắn</span>}
                {!p.cover_image_url && <span className={styles.missing}>Cần ảnh bìa có quyền sử dụng</span>}
              </div>
              <div style={{ marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <Link href={`/dashboard/places/${p.id}/edit`}>Sửa →</Link>
                <Link href={`/dashboard/places/${p.id}/photos`}>Quản lý ảnh →</Link>
                <Link href={`/dashboard/places/${p.id}/preview`}>Xem trước →</Link>
                {p.status === 'published' ? (
                  <Link href={editorialPublicDetailHref(categories.find((c) => c.id === p.category_id)?.slug ?? category, p.slug)} target="_blank">
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
      {state.kind === 'ready' && <nav aria-label="Phân trang địa điểm" style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button type="button" disabled={page <= 1} onClick={() => { setPage((p) => p - 1); setState({ kind: 'loading' }); }}>Trang trước</button>
        <span>Trang {page}/{Math.max(1, state.totalPages)} · {state.total} địa điểm</span>
        <button type="button" disabled={page >= state.totalPages} onClick={() => { setPage((p) => p + 1); setState({ kind: 'loading' }); }}>Trang sau</button>
      </nav>}
    </main>
  );
}
