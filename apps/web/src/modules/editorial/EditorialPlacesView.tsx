'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { fetchCapabilities } from '@/modules/auth/api/me.api';
import { listPlaces } from '@/modules/places/api/places.api';
import type { PlaceCard } from '@/modules/places/types';
import placeStyles from '@/modules/places/places.module.css';

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; places: PlaceCard[] };

/**
 * Danh sách địa điểm cho ĐỘI VẬN HÀNH (Operator Bootstrap & Editorial Place Content, 2026-08-12).
 *
 * Vì sao KHÔNG dùng `GET /places/mine` như màn hình chủ cơ sở: `listMine()` chỉ liệt kê grant
 * `scope_type='managed'` có `business_id` — tức là "địa điểm tôi được giao quản lý". Người biên
 * tập giữ grant TOÀN CỤC (`Place.Edit.Any`, `business_id = NULL`) nên `listMine()` trả về rỗng cho
 * họ, và điều đó ĐÚNG: họ không "quản lý" địa điểm nào cả, họ biên tập được mọi địa điểm. Danh
 * sách ở đây vì vậy đọc từ chính kênh công khai `GET /places` — không cần endpoint mới, và không
 * có dữ liệu riêng tư nào để lộ (đây là những địa điểm ai cũng xem được).
 *
 * Kiểm tra năng lực chỉ để KHÔNG mời gọi một thao tác chắc chắn bị từ chối — KHÔNG phải lớp bảo
 * mật. Mọi ghi thật vẫn qua `PermissionsGuard` ở backend.
 */
export function EditorialPlacesView() {
  const [state, setState] = useState<State>({ kind: 'loading' });

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
        return listPlaces({ limit: 50 });
      })
      .then((places) => {
        if (cancelled || places === null) return;
        setState({ kind: 'ready', places });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ kind: 'error', message: 'Không tải được danh sách địa điểm. Vui lòng thử lại.' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
          Bổ sung ảnh, giờ mở cửa và thông tin liên hệ cho những địa điểm chưa có chủ cơ sở nhận
          quản lý. Ảnh bạn tải lên vẫn phải qua kiểm duyệt bởi một người khác trước khi hiển thị
          công khai.
        </p>
      </header>

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
        </div>
      )}

      {state.kind === 'ready' && state.places.length === 0 && (
        <p className={placeStyles.stateTitle}>Chưa có địa điểm nào.</p>
      )}

      {state.kind === 'ready' && state.places.length > 0 && (
        <ul>
          {state.places.map((p) => (
            <li key={p.id} style={{ padding: '0.6rem 0', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
              <strong>{p.name}</strong>
              {!p.cover_image_url && (
                <span style={{ marginLeft: 8, color: 'var(--muted)' }}>· chưa có ảnh bìa</span>
              )}
              <div style={{ marginTop: 4, display: 'flex', gap: 12 }}>
                <Link href={`/dashboard/places/${p.id}/photos`}>Quản lý ảnh →</Link>
                <Link href={`/places/${p.slug}`}>Xem trang công khai →</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
