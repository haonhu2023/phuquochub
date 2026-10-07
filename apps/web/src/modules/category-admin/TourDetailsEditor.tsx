'use client';

import { useEffect, useState } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import {
  getTourDetailsAdmin,
  updateTourDetails,
  type TourDetailsAdmin,
  type TourDifficulty,
  type TourType,
} from '@/modules/tours/api/tours.admin.api';
import styles from '@/modules/place-management/place-management.module.css';
import uiStyles from '@/components/ui/ui.module.css';

interface Props {
  placeId: string;
  // CAS thật — token places.content_version do EditPlaceView giữ (cùng khuôn BeachDetailsEditor).
  contentVersion: number;
  onVersionChange: (v: number) => void;
}

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready' };

const TOUR_TYPE_LABEL: Record<TourType, string> = {
  diving: 'Lặn',
  fishing: 'Câu cá',
  trekking: 'Đi bộ/trekking',
  sightseeing: 'Tham quan',
  cruise: 'Du thuyền',
  other: 'Khác',
};

const DIFFICULTY_LABEL: Record<TourDifficulty, string> = {
  easy: 'Dễ',
  moderate: 'Trung bình',
  hard: 'Khó',
};

function textOrNull(v: string): string | null {
  const t = v.trim();
  return t ? t : null;
}

/**
 * Chi tiết tour (loại, thời lượng, độ khó, điểm đón, bao gồm/không, chính sách hủy) — nhúng vào
 * EditPlaceView khi category_slug='tour'. PATCH có CAS. Thời lượng trống là "chưa khai", không phải 0.
 */
export function TourDetailsEditor({ placeId, contentVersion, onVersionChange }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [tourType, setTourType] = useState('');
  const [duration, setDuration] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [pickup, setPickup] = useState('');
  const [inclusions, setInclusions] = useState('');
  const [exclusions, setExclusions] = useState('');
  const [cancellation, setCancellation] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyDetails(d: TourDetailsAdmin | null) {
    setTourType(d?.tour_type ?? '');
    setDuration(d?.duration_minutes != null ? String(d.duration_minutes) : '');
    setDifficulty(d?.difficulty ?? '');
    setPickup(d?.pickup_point ?? '');
    setInclusions(d?.inclusions ?? '');
    setExclusions(d?.exclusions ?? '');
    setCancellation(d?.cancellation_policy ?? '');
  }

  useEffect(() => {
    let cancelled = false;
    // Trì hoãn qua microtask — cùng khuôn BeachDetailsEditor (tránh set-state-in-effect đồng bộ).
    void Promise.resolve().then(() => {
      const session = readSession();
      if (!session) {
        if (!cancelled) setState({ kind: 'error', message: 'Phiên đăng nhập đã hết hạn — tải lại trang.' });
        return;
      }
      getTourDetailsAdmin(placeId, session.accessToken)
        .then((d) => {
          if (cancelled) return;
          applyDetails(d);
          setState({ kind: 'ready' });
        })
        .catch(() => {
          if (!cancelled) setState({ kind: 'error', message: 'Không tải được chi tiết tour.' });
        });
    });
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  if (state.kind === 'loading') return <p style={{ color: 'var(--muted)' }}>Đang tải chi tiết tour…</p>;
  if (state.kind === 'error') return <p className={styles.alert}>{state.message}</p>;

  async function onSave() {
    const session = readSession();
    if (!session) return;
    setError(null);
    setNotice(null);
    const trimmedDuration = duration.trim();
    if (trimmedDuration && !/^\d+$/.test(trimmedDuration)) {
      setError('Thời lượng phải là số phút nguyên dương.');
      return;
    }
    setBusy(true);
    try {
      const updated = await updateTourDetails(
        placeId,
        {
          expected_content_version: contentVersion,
          // Loại tour là NOT NULL: chỉ gửi khi đã chọn; lần đầu thiếu loại, máy chủ trả 400 và giữ nguyên nội dung.
          ...(tourType ? { tour_type: tourType as TourType } : {}),
          duration_minutes: trimmedDuration ? Number(trimmedDuration) : null,
          difficulty: difficulty ? (difficulty as TourDifficulty) : null,
          pickup_point: textOrNull(pickup),
          inclusions: textOrNull(inclusions),
          exclusions: textOrNull(exclusions),
          cancellation_policy: textOrNull(cancellation),
        },
        session.accessToken,
      );
      applyDetails(updated);
      onVersionChange(updated.content_version);
      setNotice('Đã lưu chi tiết tour.');
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : 'Lưu thất bại. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Chi tiết tour" className={styles.contentEditor}>
      <h2>Chi tiết tour</h2>

      <label className={uiStyles.field} style={{ marginTop: '0.75rem' }}>
        <span className={uiStyles.fieldLabel}>Loại tour</span>
        <select className={styles.input} value={tourType} onChange={(e) => setTourType(e.target.value)}>
          <option value="">Chưa chọn</option>
          {(Object.keys(TOUR_TYPE_LABEL) as TourType[]).map((t) => (
            <option key={t} value={t}>
              {TOUR_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </label>

      <label className={uiStyles.field} style={{ marginTop: '0.75rem' }}>
        <span className={uiStyles.fieldLabel}>Thời lượng (phút)</span>
        <input className={styles.input} type="text" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="Để trống nếu chưa rõ" />
      </label>

      <label className={uiStyles.field} style={{ marginTop: '0.75rem' }}>
        <span className={uiStyles.fieldLabel}>Độ khó</span>
        <select className={styles.input} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
          <option value="">Chưa rõ</option>
          {(Object.keys(DIFFICULTY_LABEL) as TourDifficulty[]).map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY_LABEL[d]}
            </option>
          ))}
        </select>
      </label>

      <label className={uiStyles.field} style={{ marginTop: '0.75rem' }}>
        <span className={uiStyles.fieldLabel}>Điểm đón khách</span>
        <input className={styles.input} type="text" value={pickup} onChange={(e) => setPickup(e.target.value)} />
      </label>

      <label className={uiStyles.field} style={{ marginTop: '0.75rem' }}>
        <span className={uiStyles.fieldLabel}>Bao gồm</span>
        <input className={styles.input} type="text" value={inclusions} onChange={(e) => setInclusions(e.target.value)} />
      </label>

      <label className={uiStyles.field} style={{ marginTop: '0.75rem' }}>
        <span className={uiStyles.fieldLabel}>Không bao gồm</span>
        <input className={styles.input} type="text" value={exclusions} onChange={(e) => setExclusions(e.target.value)} />
      </label>

      <label className={uiStyles.field} style={{ marginTop: '0.75rem' }}>
        <span className={uiStyles.fieldLabel}>Quy định hủy</span>
        <input className={styles.input} type="text" value={cancellation} onChange={(e) => setCancellation(e.target.value)} />
      </label>

      {error && <p className={styles.alert} role="alert">{error}</p>}
      {notice && <p className={styles.success} role="status">{notice}</p>}

      <div className={styles.actions} style={{ marginTop: '0.75rem' }}>
        <button type="button" className={styles.submitBtn} onClick={() => void onSave()} disabled={busy}>
          {busy ? 'Đang lưu…' : 'Lưu chi tiết tour'}
        </button>
      </div>
    </section>
  );
}
