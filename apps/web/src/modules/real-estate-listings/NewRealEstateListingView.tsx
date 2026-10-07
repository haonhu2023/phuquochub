'use client';

import { useState } from 'react';
import Link from 'next/link';
import placeStyles from '@/modules/places/places.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';
import { RealEstateListingForm } from './RealEstateListingForm';
import type { RealEstateListingSenderView } from './types';

export function NewRealEstateListingView() {
  const [saved, setSaved] = useState<RealEstateListingSenderView | null>(null);

  if (saved) {
    return (
      <main>
        <header className={placeStyles.pageHeader}>
          <h1 className={placeStyles.pageTitle}>Đăng tin bất động sản</h1>
        </header>
        <div className={placeStyles.state} role="status">
          <p className={placeStyles.stateTitle}>Đã lưu nháp</p>
          <p>
            Tin &quot;{saved.title}&quot; đã được lưu dưới dạng nháp. Vào &quot;Tin bất động sản của
            tôi&quot; để gửi duyệt khi sẵn sàng.
          </p>
          <div className={placeMgmtStyles.actions} style={{ justifyContent: 'center', marginTop: '1rem' }}>
            <Link href="/dashboard/real-estate" className={placeStyles.btn}>
              Về Tin bất động sản của tôi
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Đăng tin bất động sản</h1>
        <p className={placeStyles.pageLede}>
          Tin được lưu dưới dạng nháp — gửi duyệt khi sẵn sàng, chỉ hiện công khai sau khi được duyệt.
        </p>
      </header>
      <RealEstateListingForm onSaved={setSaved} />
    </main>
  );
}
