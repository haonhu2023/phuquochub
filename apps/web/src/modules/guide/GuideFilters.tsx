'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { GUIDE_CATEGORY_LABELS, GUIDE_CATEGORY_VALUES } from './guideCategory';
import { useLocale } from '@/lib/LocaleContext';
import { localizedHref } from '@/lib/locale';
import { getFilterChrome } from '@/lib/filters.copy';
import styles from '@/components/ui/ui.module.css';

interface Props {
  total: number;
}

const RESULT_UNIT: Record<'vi' | 'en', string> = { vi: 'bài viết', en: 'articles' };
const CATEGORY_LABEL: Record<'vi' | 'en', string> = { vi: 'Chuyên mục', en: 'Category' };

// Chuyên mục cẩm nang — lọc công khai THẬT (2026-09-29), cùng khuôn AttractionFilters.tsx: Client
// Component chỉ đọc/ghi query string (?category=), danh sách thật fetch ở Server Component cha
// (page.tsx). `tag` (cũng lọc được ở API) chưa có UI riêng ở đây — mỗi thẻ trên GuideArticleCard tự
// là một link `?tag=...`, không cần thêm một bộ chọn thứ hai cho MVP này.
export function GuideFilters({ total }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const chrome = getFilterChrome(locale);

  function updateCategory(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set('category', value);
    } else {
      params.delete('category');
    }
    router.push(`${localizedHref(locale, '/guide')}${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="guide-category">
          {CATEGORY_LABEL[locale]}
        </label>
        <select
          id="guide-category"
          className={styles.select}
          value={searchParams.get('category') ?? ''}
          onChange={(e) => updateCategory(e.target.value)}
        >
          <option value="">{chrome.allOption}</option>
          {GUIDE_CATEGORY_VALUES.map((c) => (
            <option key={c} value={c}>
              {GUIDE_CATEGORY_LABELS[locale][c]}
            </option>
          ))}
        </select>
      </div>
      <span className={styles.resultCount}>
        {total} {RESULT_UNIT[locale]}
      </span>
    </div>
  );
}
