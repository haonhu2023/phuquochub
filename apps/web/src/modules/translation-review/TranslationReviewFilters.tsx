'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import styles from '@/components/ui/ui.module.css';
import { FIELD_KEY_LABELS, LOCALE_LABELS, labelOf } from './labels';

const BASE = '/dashboard/translations/review';

// Bộ lọc hàng chờ duyệt bản dịch — điều khiển bằng URL để chia sẻ/bookmark được (cùng quy ước
// ModerationFilters.tsx). Chỉ 3 lọc thực sự hữu ích ở quy mô hiện tại (placeSlug/localeCode/
// fieldKey) — không thêm control cho những gì hàng chờ chưa cần.
export function TranslationReviewFilters({ total }: { total: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`${BASE}${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="tr-place-slug">
          Địa điểm (slug)
        </label>
        <input
          id="tr-place-slug"
          className={styles.select}
          type="text"
          inputMode="text"
          placeholder="Tất cả"
          defaultValue={searchParams.get('placeSlug') ?? ''}
          onBlur={(e) => setParam('placeSlug', e.target.value.trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setParam('placeSlug', (e.target as HTMLInputElement).value.trim());
          }}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="tr-locale">
          Ngôn ngữ
        </label>
        <select
          id="tr-locale"
          className={styles.select}
          value={searchParams.get('localeCode') ?? ''}
          onChange={(e) => setParam('localeCode', e.target.value)}
        >
          <option value="">Tất cả</option>
          {Object.keys(LOCALE_LABELS).map((v) => (
            <option key={v} value={v}>
              {labelOf(LOCALE_LABELS, v)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="tr-field">
          Loại nội dung
        </label>
        <select
          id="tr-field"
          className={styles.select}
          value={searchParams.get('fieldKey') ?? ''}
          onChange={(e) => setParam('fieldKey', e.target.value)}
        >
          <option value="">Tất cả</option>
          {Object.keys(FIELD_KEY_LABELS).map((v) => (
            <option key={v} value={v}>
              {labelOf(FIELD_KEY_LABELS, v)}
            </option>
          ))}
        </select>
      </div>

      <span className={styles.resultCount}>{total} bản dịch chờ duyệt</span>
    </div>
  );
}
