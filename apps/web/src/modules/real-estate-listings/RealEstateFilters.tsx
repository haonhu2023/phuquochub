'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { REAL_ESTATE_PROPERTY_TYPES, REAL_ESTATE_TRANSACTION_TYPES, realEstatePropertyTypeLabel, realEstateTransactionTypeLabel } from './types';
import { useLocale } from '@/lib/LocaleContext';
import { localizedHref } from '@/lib/locale';
import styles from '@/components/ui/ui.module.css';

const LABELS = {
  vi: { total: (n: number) => `${n} tin bất động sản`, transaction: 'Giao dịch', property: 'Loại hình', ward: 'Khu vực', all: 'Tất cả' },
  en: { total: (n: number) => `${n} real estate listings`, transaction: 'Transaction', property: 'Property type', ward: 'Area', all: 'All' },
};

interface Props {
  total: number;
}

export function RealEstateFilters({ total }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = LABELS[locale];

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('page');
    router.push(`${localizedHref(locale, '/real-estate')}${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <div className={styles.toolbar}>
      <p style={{ margin: 0, alignSelf: 'center' }}>{t.total(total)}</p>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="re-transaction-type">
          {t.transaction}
        </label>
        <select
          id="re-transaction-type"
          className={styles.select}
          value={searchParams.get('transaction_type') ?? ''}
          onChange={(e) => updateParam('transaction_type', e.target.value)}
        >
          <option value="">{t.all}</option>
          {REAL_ESTATE_TRANSACTION_TYPES.map((v) => (
            <option key={v} value={v}>
              {realEstateTransactionTypeLabel(v, locale)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="re-property-type">
          {t.property}
        </label>
        <select
          id="re-property-type"
          className={styles.select}
          value={searchParams.get('property_type') ?? ''}
          onChange={(e) => updateParam('property_type', e.target.value)}
        >
          <option value="">{t.all}</option>
          {REAL_ESTATE_PROPERTY_TYPES.map((v) => (
            <option key={v} value={v}>
              {realEstatePropertyTypeLabel(v, locale)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="re-ward">
          {t.ward}
        </label>
        <input
          id="re-ward"
          className={styles.select}
          type="text"
          defaultValue={searchParams.get('ward') ?? ''}
          onBlur={(e) => updateParam('ward', e.target.value.trim())}
          maxLength={80}
        />
      </div>
    </div>
  );
}
