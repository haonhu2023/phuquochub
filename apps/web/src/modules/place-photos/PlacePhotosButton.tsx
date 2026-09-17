'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/modules/auth/AuthProvider';
import { readSession } from '@/modules/auth/session';
import { fetchCapabilities } from '@/modules/auth/api/me.api';
import { NO_CAPABILITIES, type UserCapabilities } from '@/modules/auth/capabilities';
import { PlacePhotosManager } from './PlacePhotosManager';
import styles from './place-photos-drawer.module.css';

interface Props {
  placeId: string;
}

/**
 * Nút "📷 Quản lý ảnh" + drawer QUẢN LÝ ẢNH của địa điểm NGAY TRÊN trang công khai (content_owner,
 * 2026-09-17) — cùng khuôn `PlaceDescriptionEditor.tsx` (nút ✏️ Sửa nội dung): component TỰ kiểm
 * tra `useAuth()`/năng lực, trang cha (Server Component) không cần biết gì về phiên đăng nhập.
 * LUÔN render trong HTML server-side; component TỰ quyết định có hiện gì hay không sau khi
 * hydrate — khách chưa đăng nhập/không đủ quyền không thấy gì, kể cả sau hydration.
 *
 * Hiện CẢ KHI gallery rỗng — nút không phụ thuộc số ảnh hiện có (`caps.canEditorial`, không phải
 * điều kiện nào liên quan tới ảnh), vì chức năng đầu tiên của drawer chính là tải ảnh ĐẦU TIÊN lên.
 *
 * Tái sử dụng NGUYÊN VẸN `PlacePhotosManager` — cùng logic với màn hình quản lý dashboard
 * (`/dashboard/places/{id}/photos`, `PhotosView.tsx`), không tạo bản sao thứ hai của luồng tải/
 * duyệt/sắp xếp/đặt bìa.
 *
 * `caps.canEditorial` (không phải một cờ riêng cho content_owner) — CÙNG cờ, CÙNG lý do đã dùng ở
 * `PlaceDescriptionEditor`: đó chính là năng lực thật cần để gọi được các route ảnh của cơ sở
 * (`Media.Upload.Managed`, content_owner/contributor đều thoả qua `Media.Upload.Any`). Đây THUẦN
 * TUÝ là hiển thị — backend vẫn là nơi quyết định duy nhất; cờ sai/thiếu chỉ ẩn nút, API vẫn tự
 * chặn bằng PermissionsGuard nếu ai đó cố gọi thẳng.
 */
export function PlacePhotosButton({ placeId }: Props) {
  const { isAuthenticated, initializing } = useAuth();
  const [caps, setCaps] = useState<UserCapabilities>(NO_CAPABILITIES);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    const session = readSession();
    if (!session) return;
    let cancelled = false;
    void fetchCapabilities(session.accessToken).then((c) => {
      if (!cancelled) setCaps(c);
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  if (initializing || !isAuthenticated || !caps.canEditorial) {
    return null;
  }

  return (
    <>
      <button type="button" className={styles.photosTrigger} onClick={() => setOpen(true)}>
        📷 Quản lý ảnh
      </button>
      {open && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Quản lý ảnh">
          <div className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <h2>Quản lý ảnh</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Đóng">
                ✕
              </button>
            </div>
            <PlacePhotosManager placeId={placeId} />
          </div>
        </div>
      )}
    </>
  );
}
