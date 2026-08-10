'use client';

import { useState } from 'react';
import type { Category } from '@/modules/categories/api/categories.api';
import { PHU_QUOC_WARDS } from '@/modules/places/wards';
import { MapView } from './MapView';
import uiStyles from '@/components/ui/ui.module.css';

interface Props {
  categories: Category[];
}

// Bộ lọc category/ward cho /map — state cục bộ (KHÔNG qua URL/router.push như SearchFilters):
// đổi filter chỉ cần MapView tải lại marker trong khung nhìn hiện tại, điều hướng lại trang sẽ
// remount bản đồ và làm mất vị trí/zoom người dùng đang xem (jumping). Tái dùng đúng style
// toolbar/field/select đã có ở ui.module.css (SearchFilters dùng cho /search).
export function MapExplorer({ categories }: Props) {
  const [category, setCategory] = useState('');
  const [ward, setWard] = useState('');

  return (
    <>
      <div className={uiStyles.toolbar}>
        <div className={uiStyles.field}>
          <label className={uiStyles.fieldLabel} htmlFor="map-category">
            Danh mục
          </label>
          <select
            id="map-category"
            className={uiStyles.select}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Tất cả</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name_vi}
              </option>
            ))}
          </select>
        </div>

        <div className={uiStyles.field}>
          <label className={uiStyles.fieldLabel} htmlFor="map-ward">
            Khu vực
          </label>
          <select id="map-ward" className={uiStyles.select} value={ward} onChange={(e) => setWard(e.target.value)}>
            <option value="">Tất cả</option>
            {PHU_QUOC_WARDS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>
      </div>

      <MapView category={category || undefined} ward={ward || undefined} categories={categories} />
    </>
  );
}
