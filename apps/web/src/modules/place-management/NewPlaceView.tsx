'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { readSession } from '@/modules/auth/session';
import placeStyles from '@/modules/places/places.module.css';
import { PlaceForm } from './PlaceForm';
import { createPlace } from './api/place-management.api';
import type { PlaceFormInput } from './types';
import styles from './place-management.module.css';

// Tạo địa điểm (POST /places, Place.Create — mở cho mọi thành viên đã đăng nhập).
//
// P1 (Owner self-publish, 2026-09-22): trạng thái khởi tạo giờ PHỤ THUỘC người tạo (xem
// PlacesService.create() — actor giữ Place.Approve → `draft`, tự xuất bản được; ngược lại →
// `pending`, chờ duyệt như trước). Hai kết quả cần hai màn khác nhau:
//   - `draft`: chuyển THẲNG sang trang Sửa của chính place đó — nơi có nút "Xuất bản" — cùng khuôn
//     GuideArticleEditorView (`router.replace` sau khi tạo), không dừng ở màn "đã gửi" trung gian.
//   - `pending`: GIỮ NGUYÊN màn hình cũ — đây là đóng góp cộng đồng, chưa có quyền quản lý, nên
//     KHÔNG có trang Sửa nào để chuyển tới (listMine()/preview() đều sẽ từ chối).
export function NewPlaceView() {
  const router = useRouter();
  const [createdName, setCreatedName] = useState<string | null>(null);

  async function handleSubmit(input: PlaceFormInput): Promise<void> {
    const session = readSession();
    if (!session) {
      throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }
    const created = await createPlace(input, session.accessToken);
    if (created.status === 'draft') {
      router.replace(`/dashboard/places/${created.id}/edit`);
      return;
    }
    setCreatedName(input.name);
  }

  if (createdName) {
    return (
      <main>
        <header className={placeStyles.pageHeader}>
          <h1 className={placeStyles.pageTitle}>Thêm địa điểm</h1>
        </header>
        <div className={placeStyles.state} role="status">
          <p className={placeStyles.stateTitle}>Đã gửi &quot;{createdName}&quot;</p>
          <p>
            Địa điểm đang chờ kiểm duyệt. Đây là một đóng góp nội dung công khai, nên nó{' '}
            <strong>chưa xuất hiện</strong> ở &quot;Địa điểm của tôi&quot; — quyền quản lý chỉ được
            cấp sau khi cơ sở được duyệt và yêu cầu xác nhận sở hữu của bạn được chấp thuận.
          </p>
          <div className={styles.actions} style={{ justifyContent: 'center', marginTop: '1rem' }}>
            <button type="button" className={placeStyles.btn} onClick={() => setCreatedName(null)}>
              Thêm địa điểm khác
            </button>
            <Link href="/dashboard/places" className={styles.cancelLink}>
              Về Địa điểm của tôi
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Thêm địa điểm</h1>
        <p className={placeStyles.pageLede}>
          Gửi thông tin một địa điểm mới cho PhuQuocHub. Thông tin sẽ được kiểm duyệt trước khi
          hiển thị công khai.
        </p>
      </header>
      <PlaceForm
        submitLabel="Tạo địa điểm"
        submittingLabel="Đang tạo…"
        onSubmit={handleSubmit}
        cancelHref="/dashboard/places"
      />
    </main>
  );
}
