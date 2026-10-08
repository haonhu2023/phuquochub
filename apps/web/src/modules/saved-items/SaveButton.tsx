'use client';

import { useState } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { saveItem, unsaveItem } from './api/saved-items.api';
import type { SavedItemTargetType } from './types';
import placeStyles from '@/modules/places/places.module.css';

interface Props {
  targetType: SavedItemTargetType;
  targetId: string;
  locale?: 'vi' | 'en';
}

const LABELS = {
  vi: { save: '☆ Lưu tin', saved: '★ Đã lưu — bấm để bỏ lưu', loginRequired: 'Đăng nhập để lưu tin này.' },
  en: { save: '☆ Save', saved: '★ Saved — click to unsave', loginRequired: 'Log in to save this listing.' },
};

// Nút lưu/bỏ lưu dùng chung cho mọi loại tin lưu được (job_listing/real_estate_listing — xem
// saved-items.enums.ts). KHÔNG biết trạng thái đã-lưu-hay-chưa lúc trang vừa tải (trang chi tiết
// công khai là Server Component không có phiên đăng nhập để hỏi trước) — bắt đầu ở trạng thái
// "chưa lưu" và tự cập nhật theo thao tác của người dùng; "Tin đã lưu" trong dashboard là nơi xem
// đúng trạng thái đã lưu thật.
export function SaveButton({ targetType, targetId, locale = 'vi' }: Props) {
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = LABELS[locale];

  async function toggle() {
    const session = readSession();
    if (!session) {
      setError(t.loginRequired);
      return;
    }
    setPending(true);
    setError(null);
    try {
      if (saved) {
        await unsaveItem(targetType, targetId, session.accessToken);
        setSaved(false);
      } else {
        await saveItem(targetType, targetId, session.accessToken);
        setSaved(true);
      }
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : 'Không thực hiện được. Vui lòng thử lại.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button type="button" className={placeStyles.btn} onClick={toggle} disabled={pending} aria-pressed={saved}>
        {saved ? t.saved : t.save}
      </button>
      {error && (
        <p role="alert" style={{ color: 'var(--danger, #b91c1c)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
          {error}
        </p>
      )}
    </div>
  );
}
