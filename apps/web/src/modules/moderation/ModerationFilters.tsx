'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import styles from '@/components/ui/ui.module.css';
import {
  MODERATION_CASE_STATUSES,
  MODERATION_SEVERITIES,
  MODERATION_SOURCES,
  MODERATION_TARGET_TYPES,
} from './types';
import {
  CASE_STATUS_LABELS,
  SEVERITY_LABELS,
  SOURCE_LABELS,
  TARGET_TYPE_LABELS,
  labelOf,
} from './labels';

const BASE = '/dashboard/moderation';

// Bộ lọc hàng chờ (M2: status/target_type/source/severity/assigned_to) — điều khiển bằng URL để
// chia sẻ/bookmark được. Đổi bộ lọc luôn reset page=1. KHÔNG có sort control (thứ tự cố định ở BE).
// Component chỉ đọc/ghi URL; view cha fetch theo searchParams.
export function ModerationFilters({ total }: { total: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page'); // đổi bộ lọc -> về trang 1
    router.push(`${BASE}${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="mod-status">
          Trạng thái
        </label>
        <select
          id="mod-status"
          className={styles.select}
          value={searchParams.get('status') ?? ''}
          onChange={(e) => setParam('status', e.target.value)}
        >
          <option value="">Hàng chờ (mở + đang xử lý)</option>
          {MODERATION_CASE_STATUSES.map((v) => (
            <option key={v} value={v}>
              {labelOf(CASE_STATUS_LABELS, v)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="mod-target-type">
          Loại nội dung
        </label>
        <select
          id="mod-target-type"
          className={styles.select}
          value={searchParams.get('target_type') ?? ''}
          onChange={(e) => setParam('target_type', e.target.value)}
        >
          <option value="">Tất cả</option>
          {MODERATION_TARGET_TYPES.map((v) => (
            <option key={v} value={v}>
              {labelOf(TARGET_TYPE_LABELS, v)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="mod-source">
          Nguồn
        </label>
        <select
          id="mod-source"
          className={styles.select}
          value={searchParams.get('source') ?? ''}
          onChange={(e) => setParam('source', e.target.value)}
        >
          <option value="">Tất cả</option>
          {MODERATION_SOURCES.map((v) => (
            <option key={v} value={v}>
              {labelOf(SOURCE_LABELS, v)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="mod-severity">
          Mức độ
        </label>
        <select
          id="mod-severity"
          className={styles.select}
          value={searchParams.get('severity') ?? ''}
          onChange={(e) => setParam('severity', e.target.value)}
        >
          <option value="">Tất cả</option>
          {MODERATION_SEVERITIES.map((v) => (
            <option key={v} value={v}>
              {labelOf(SEVERITY_LABELS, v)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="mod-assigned-to">
          Người xử lý (UUID)
        </label>
        <input
          id="mod-assigned-to"
          className={styles.select}
          type="text"
          inputMode="text"
          placeholder="Tất cả"
          defaultValue={searchParams.get('assigned_to') ?? ''}
          // Cập nhật khi rời ô hoặc nhấn Enter (không đổi URL theo từng ký tự).
          onBlur={(e) => setParam('assigned_to', e.target.value.trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setParam('assigned_to', (e.target as HTMLInputElement).value.trim());
          }}
        />
      </div>

      <span className={styles.resultCount}>{total} case</span>
    </div>
  );
}
