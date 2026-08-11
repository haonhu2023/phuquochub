'use client';

import { useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import placeStyles from '@/modules/places/places.module.css';
import { PlaceForm } from './PlaceForm';
import { createPlace } from './api/place-management.api';
import type { PlaceFormInput } from './types';
import styles from './place-management.module.css';

// Tạo địa điểm (POST /places, Place.Create — mở cho mọi thành viên đã đăng nhập). QUAN TRỌNG:
// tạo mới KHÔNG tự cấp quyền quản lý cho người tạo (xem PlacesService.listMine, places.service.ts)
// — địa điểm vào hàng chờ kiểm duyệt (`pending`) và sẽ KHÔNG xuất hiện ở "Địa điểm của tôi" cho
// tới khi có quyền quản lý (qua luồng xác nhận sở hữu cơ sở đã được duyệt). Vì vậy màn thành công
// ở đây GIẢI THÍCH RÕ điều này thay vì chuyển hướng thẳng về danh sách (nơi mục vừa tạo sẽ KHÔNG
// xuất hiện — im lặng làm vậy sẽ trông như một lỗi).
export function NewPlaceView() {
  const [createdName, setCreatedName] = useState<string | null>(null);

  async function handleSubmit(input: PlaceFormInput): Promise<void> {
    const session = readSession();
    if (!session) {
      throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }
    await createPlace(input, session.accessToken);
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
