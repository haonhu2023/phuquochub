'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { previewPlace } from '@/modules/place-management/api/place-management.api';
import type { ManagedPlace } from '@/modules/place-management/types';
import { getOpeningWeek, hasOpeningHours as hasOpeningHoursValue } from '@/modules/places/openingHours';
import { submitOpeningHoursEvidence } from './api/opening-hours-evidence.api';
import { OFFICIAL_SOURCE_TYPE_VALUES, type OfficialSourceType, type ScheduleStability } from './types';
import styles from '@/modules/place-management/place-management.module.css';
import uiStyles from '@/components/ui/ui.module.css';

interface Props {
  placeId: string;
}

const SOURCE_TYPE_LABELS: Record<OfficialSourceType, string> = {
  official_website: 'Trang web chính thức của cơ sở',
  business_owner: 'Chủ cơ sở tự công bố (vd Facebook/Zalo chính chủ)',
  government: 'Cơ quan nhà nước',
};

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; place: ManagedPlace };

// Nộp bằng chứng giờ mở cửa (Opening-Hours Evidence Workflow, 2026-10-11) — tách khỏi editor giờ
// mở cửa chính (PlaceForm, nhánh "opening_hours" trong EditPlaceView) vì đây là một quyết định
// KHÁC: không sửa giá trị, chỉ nộp một quan sát từ nguồn bên ngoài để một moderator (Source.Verify)
// xét duyệt riêng — cùng khuôn "ảnh/photos" và "liên hệ/contacts" đã tách trang trong EditPlaceView.
export function OpeningHoursEvidenceSubmitView({ placeId }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [sourceType, setSourceType] = useState<OfficialSourceType>('official_website');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [observedText, setObservedText] = useState('');
  const [scheduleStability, setScheduleStability] = useState<ScheduleStability>('STABLE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      const session = readSession();
      if (!session) {
        if (!cancelled) setState({ kind: 'error', message: 'Phiên đăng nhập đã hết hạn — tải lại trang.' });
        return;
      }
      previewPlace(placeId, session.accessToken)
        .then((place) => {
          if (!cancelled) setState({ kind: 'ready', place });
        })
        .catch(() => {
          if (!cancelled) setState({ kind: 'error', message: 'Không tải được thông tin địa điểm.' });
        });
    });
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  if (state.kind === 'loading') return <p style={{ color: 'var(--muted)' }}>Đang tải…</p>;
  if (state.kind === 'error') return <p className={styles.alert}>{state.message}</p>;

  const openingWeek = getOpeningWeek(state.place.opening_hours);
  const hasOpeningHours = hasOpeningHoursValue(state.place.opening_hours);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const session = readSession();
    if (!session) {
      setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }
    setError(null);
    setNotice(null);
    if (!sourceUrl.trim() || !observedText.trim()) {
      setError('Vui lòng nhập đủ URL nguồn và nội dung đã xem được tại nguồn.');
      return;
    }
    setBusy(true);
    try {
      await submitOpeningHoursEvidence(
        placeId,
        {
          source_type: sourceType,
          source_url: sourceUrl.trim(),
          source_title: sourceTitle.trim() || undefined,
          observed_text: observedText.trim(),
          schedule_stability: scheduleStability,
        },
        session.accessToken,
      );
      setNotice('Đã nộp bằng chứng — đang chờ moderator xét duyệt. Giờ mở cửa công khai CHƯA đổi cho tới khi được duyệt.');
      setSourceUrl('');
      setSourceTitle('');
      setObservedText('');
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : 'Nộp bằng chứng thất bại. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header className={styles.section}>
        <h1 className={styles.sectionTitle}>Nộp bằng chứng giờ mở cửa — {state.place.name}</h1>
        <p className={styles.fieldHint}>
          Giờ mở cửa công khai chỉ hiện khi có bằng chứng từ nguồn chính thức được moderator xác nhận. Nộp ở đây KHÔNG tự đổi giờ hiện có —
          chỉ ghi lại một quan sát để chờ xét duyệt.
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          <Link href={`/dashboard/places/${placeId}/edit`} style={{ color: 'var(--accent)' }}>
            ← Về trang sửa địa điểm
          </Link>
        </p>
      </header>

      <section className={styles.contentEditor}>
        <h2>Giờ mở cửa hiện tại đã nhập</h2>
        {hasOpeningHours ? (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {openingWeek.map((d) => (
              <li key={d.key}>
                <strong>{d.label}:</strong> {d.hours}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.fieldHint}>Địa điểm này chưa nhập giờ mở cửa nào — nhập giờ qua trang sửa địa điểm trước khi nộp bằng chứng.</p>
        )}
      </section>

      {hasOpeningHours && (
        <form onSubmit={onSubmit} aria-busy={busy} className={styles.contentEditor}>
          <h2>Bằng chứng mới</h2>
          <div className={styles.fieldGrid}>
            <label className={uiStyles.field}>
              <span className={uiStyles.fieldLabel}>Loại nguồn</span>
              <select className={styles.input} value={sourceType} onChange={(e) => setSourceType(e.target.value as OfficialSourceType)}>
                {OFFICIAL_SOURCE_TYPE_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {SOURCE_TYPE_LABELS[v]}
                  </option>
                ))}
              </select>
            </label>
            <label className={uiStyles.field}>
              <span className={uiStyles.fieldLabel}>URL nguồn</span>
              <input className={styles.input} type="text" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" />
            </label>
            <label className={uiStyles.field}>
              <span className={uiStyles.fieldLabel}>Tiêu đề nguồn (tuỳ chọn)</span>
              <input className={styles.input} type="text" value={sourceTitle} onChange={(e) => setSourceTitle(e.target.value)} />
            </label>
            <label className={uiStyles.field}>
              <span className={uiStyles.fieldLabel}>Tính ổn định của lịch</span>
              <select className={styles.input} value={scheduleStability} onChange={(e) => setScheduleStability(e.target.value as ScheduleStability)}>
                <option value="STABLE">Lịch thường xuyên, ổn định</option>
                <option value="TEMPORARY">Thông báo tạm thời (vd nghỉ lễ)</option>
              </select>
            </label>
          </div>
          <label className={uiStyles.field}>
            <span className={uiStyles.fieldLabel}>Nội dung chép lại nguyên văn từ nguồn (giờ mở cửa ghi trên nguồn đó)</span>
            <textarea
              className={styles.input}
              rows={3}
              maxLength={4000}
              value={observedText}
              onChange={(e) => setObservedText(e.target.value)}
              placeholder="Vd: Thứ 2 - Thứ 6: 9h00 - 21h00; Thứ 7, CN: 8h00 - 22h00"
            />
          </label>

          {error && (
            <p className={styles.alert} role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className={styles.success} role="status">
              {notice}
            </p>
          )}

          <div className={styles.actions}>
            <button type="submit" className={styles.submitBtn} disabled={busy}>
              {busy ? 'Đang nộp…' : 'Nộp bằng chứng'}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
