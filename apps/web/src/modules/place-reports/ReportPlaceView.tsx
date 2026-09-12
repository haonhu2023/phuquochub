'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import placeStyles from '@/modules/places/places.module.css';
import { ReportPlaceForm } from './ReportPlaceForm';

// Trang gửi "Báo thông tin sai" — cùng khuôn NewClaimView.tsx (business claim). place_id/place_name
// đến từ query string (ReportPlaceCta trên trang chi tiết Place công khai) chỉ để điền sẵn form,
// KHÔNG được tin cậy cho quyết định nào — POST /places/{id}/report luôn xác thực lại place_id ở
// backend (PlacesService.report → existsById).
export function ReportPlaceView() {
  const searchParams = useSearchParams();
  const placeId = searchParams.get('place_id');
  const placeName = searchParams.get('place_name') || 'Địa điểm đã chọn';
  const [submitted, setSubmitted] = useState(false);

  if (!placeId) {
    return (
      <main>
        <header className={placeStyles.pageHeader}>
          <h1 className={placeStyles.pageTitle}>Báo thông tin sai</h1>
        </header>
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>Chưa chọn địa điểm</p>
          <p>
            Để báo thông tin sai, hãy mở trang chi tiết của địa điểm và bấm &quot;Báo thông tin
            sai&quot; ở đó.
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
          <h1 className={placeStyles.pageTitle}>Báo thông tin sai</h1>
        </header>
        <div className={placeStyles.state} role="status">
          <p className={placeStyles.stateTitle}>Đã gửi báo cáo</p>
          <p>
            Cảm ơn bạn đã báo cho <strong>{placeName}</strong>. Kiểm duyệt viên sẽ xem xét — việc xử
            lý không diễn ra tức thì.
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
        <h1 className={placeStyles.pageTitle}>Báo thông tin sai</h1>
        <p className={placeStyles.pageLede}>
          Cho chúng tôi biết thông tin nào chưa đúng để kiểm duyệt viên xem xét và cập nhật lại.
        </p>
      </header>
      <ReportPlaceForm placeId={placeId} placeName={placeName} onSubmitted={() => setSubmitted(true)} />
    </main>
  );
}
