'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import placeStyles from '@/modules/places/places.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';
import { ClaimForm } from './ClaimForm';
import type { BusinessClaimSummary } from './types';

// Trang gửi Business Claim (PLACE-042). place_id/place_name đến từ query string (ClaimCta trên
// trang chi tiết Place công khai) — CHỈ dùng để điền sẵn form, KHÔNG được tin cậy cho bất kỳ quyết
// định nào (POST /business-claims luôn xác thực lại place_id ở backend). Thiếu place_id (truy cập
// trực tiếp URL, hoặc bị chỉnh sửa/xoá query) → hướng dẫn quay lại duyệt địa điểm thay vì render
// một form vô nghĩa.
export function NewClaimView() {
  const searchParams = useSearchParams();
  const placeId = searchParams.get('place_id');
  const placeName = searchParams.get('place_name') || 'Địa điểm đã chọn';
  const [submitted, setSubmitted] = useState<BusinessClaimSummary | null>(null);

  if (!placeId) {
    return (
      <main>
        <header className={placeStyles.pageHeader}>
          <h1 className={placeStyles.pageTitle}>Xác nhận quyền quản lý</h1>
        </header>
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>Chưa chọn địa điểm</p>
          <p>
            Để xác nhận quyền quản lý, hãy mở trang chi tiết của địa điểm bạn muốn quản lý và bấm
            &quot;Xác nhận quyền quản lý&quot; ở đó.
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
          <h1 className={placeStyles.pageTitle}>Xác nhận quyền quản lý</h1>
        </header>
        <div className={placeStyles.state} role="status">
          <p className={placeStyles.stateTitle}>Đã gửi yêu cầu</p>
          <p>
            Yêu cầu của bạn đã được gửi và đang chờ xét duyệt. Việc phê duyệt không diễn ra tức
            thì — sau khi được duyệt, <strong>{placeName}</strong> sẽ xuất hiện ở &quot;Địa điểm của
            tôi&quot; và bạn có thể chỉnh sửa nó ở đó.
          </p>
          <div className={placeMgmtStyles.actions} style={{ justifyContent: 'center', marginTop: '1rem' }}>
            <Link href="/dashboard/business-claims" className={placeStyles.btn}>
              Xem trạng thái yêu cầu
            </Link>
            <Link href="/dashboard/places" className={placeStyles.btn}>
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
        <h1 className={placeStyles.pageTitle}>Xác nhận quyền quản lý</h1>
        <p className={placeStyles.pageLede}>
          Gửi bằng chứng để kiểm duyệt viên xác minh bạn là người quản lý địa điểm này. Sau khi
          được duyệt, bạn sẽ có thể chỉnh sửa thông tin địa điểm.
        </p>
      </header>
      <ClaimForm placeId={placeId} placeName={placeName} onSubmitted={setSubmitted} />
    </main>
  );
}
