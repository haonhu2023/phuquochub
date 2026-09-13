'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import placeStyles from '@/modules/places/places.module.css';
import { getPlace } from '@/modules/places/api/places.api';
import type { PlaceDetail } from '@/modules/places/types';
import { ProposeEditForm } from './ProposeEditForm';

// Trang gửi "Đề xuất chỉnh sửa" — cùng khuôn ReportPlaceView.tsx. place_id/place_name/place_slug
// đến từ query string (ProposeEditCta trên trang chi tiết Place công khai) chỉ để điền sẵn form và
// lấy lại dữ liệu hiện tại để so sánh — KHÔNG được tin cậy cho quyết định nào. `place_slug` dùng để
// gọi lại getPlace() lấy giá trị MỚI NHẤT (không phải giá trị lúc người dùng mở trang chi tiết) —
// nếu thiếu slug hoặc lấy thất bại, form vẫn cho gửi đề xuất, chỉ là không hiện được phần so sánh.
// POST /places/{id}/edit-proposals luôn xác thực lại place_id ở backend (PlacesService.getCard…).
export function ProposeEditView() {
  const searchParams = useSearchParams();
  const placeId = searchParams.get('place_id');
  const placeName = searchParams.get('place_name') || 'Địa điểm đã chọn';
  const placeSlug = searchParams.get('place_slug');
  const [submitted, setSubmitted] = useState(false);
  const [currentPlace, setCurrentPlace] = useState<PlaceDetail | null>(null);

  useEffect(() => {
    if (!placeSlug) return;
    let cancelled = false;
    getPlace(placeSlug)
      .then((p) => {
        if (!cancelled) setCurrentPlace(p);
      })
      .catch(() => {
        // Không lấy được dữ liệu hiện tại — form vẫn dùng được, chỉ thiếu phần so sánh.
      });
    return () => {
      cancelled = true;
    };
  }, [placeSlug]);

  if (!placeId) {
    return (
      <main>
        <header className={placeStyles.pageHeader}>
          <h1 className={placeStyles.pageTitle}>Đề xuất chỉnh sửa</h1>
        </header>
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>Chưa chọn địa điểm</p>
          <p>
            Để đề xuất chỉnh sửa, hãy mở trang chi tiết của địa điểm và bấm &quot;Đề xuất chỉnh
            sửa&quot; ở đó.
          </p>
          <Link href="/places" className={placeStyles.btn}>
            Duyệt địa điểm →
          </Link>
        </div>
      </main>
    );
  }

  if (submitted) {
    return (
      <main>
        <header className={placeStyles.pageHeader}>
          <h1 className={placeStyles.pageTitle}>Đề xuất chỉnh sửa</h1>
        </header>
        <div className={placeStyles.state} role="status">
          <p className={placeStyles.stateTitle}>Đề xuất đã được gửi và đang chờ xem xét</p>
          <p>
            Cảm ơn bạn đã đóng góp cho <strong>{placeName}</strong>. Kiểm duyệt viên sẽ xem xét — đề
            xuất chưa áp dụng ngay và chưa hiển thị công khai.
          </p>
          <Link href="/places" className={placeStyles.btn}>
            Duyệt địa điểm →
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Đề xuất chỉnh sửa</h1>
        <p className={placeStyles.pageLede}>
          Cho chúng tôi biết giá trị đúng để kiểm duyệt viên xem xét và áp dụng. Khác với &quot;Báo
          thông tin sai&quot;: ở đây bạn đề xuất luôn giá trị cụ thể, không chỉ báo có vấn đề.
        </p>
      </header>
      <ProposeEditForm
        placeId={placeId}
        placeName={placeName}
        currentPlace={currentPlace}
        onSubmitted={() => setSubmitted(true)}
      />
    </main>
  );
}
