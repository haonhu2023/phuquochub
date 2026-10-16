'use client';

import { useEffect, useState } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import {
  getExternalIdentifiers,
  upsertGooglePlaceId,
  type ExternalIdentifier,
} from '@/modules/place-external-identifiers/api/place-external-identifiers.api';
import { createSource } from '@/modules/sources/api/sources.api';
import styles from '@/modules/place-management/place-management.module.css';
import uiStyles from '@/components/ui/ui.module.css';

interface Props {
  placeId: string;
}

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; current: ExternalIdentifier | null };

/**
 * Google Place ID (gói "mở đúng hồ sơ Google Maps", 2026-10-16) — nhúng vào EditPlaceView cho
 * MỌI category (không riêng hotel/restaurant): gắn SAI đúng hồ sơ Google của một địa điểm bất kỳ,
 * không phải một nhóm category cụ thể. Cùng khuôn HotelDetailsEditor (tự tải, tự lưu, không phụ
 * thuộc PlaceForm) nhưng KHÔNG dùng contentVersion CAS của place — identifier là sub-resource độc
 * lập, tự có idempotency/conflict check riêng (PlaceExternalIdentifiersService.upsertPrimaryGooglePlaceId).
 *
 * QUAN TRỌNG: nhập ID ở đây KHÔNG tự đánh dấu "đã xác minh" — `verified_at` luôn null sau khi lưu
 * (route backend không nhận field đó từ client). Chỉ một identifier ĐÃ qua bước xác minh riêng
 * (CHƯA xây ở gói này — ai/cơ chế nào được xác minh còn là quyết định chưa chốt) mới được public
 * site dùng để mở đúng hồ sơ; cho tới lúc đó trang công khai vẫn fallback sang tìm theo tên/địa chỉ.
 */
export function GooglePlaceIdEditor({ placeId }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [externalId, setExternalId] = useState('');
  const [newSourceTitle, setNewSourceTitle] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Trì hoãn qua microtask — cùng lý do HotelDetailsEditor.tsx (react-hooks/set-state-in-effect).
    void Promise.resolve().then(() => {
      const session = readSession();
      if (!session) {
        if (!cancelled) setState({ kind: 'error', message: 'Phiên đăng nhập đã hết hạn — tải lại trang.' });
        return;
      }
      getExternalIdentifiers(placeId, session.accessToken)
        .then((rows) => {
          if (cancelled) return;
          const current = rows.find((r) => r.provider === 'GOOGLE_PLACES' && r.is_primary) ?? null;
          setState({ kind: 'ready', current });
          if (current) setExternalId(current.external_id);
        })
        .catch(() => {
          if (!cancelled) setState({ kind: 'error', message: 'Không tải được định danh Google Maps.' });
        });
    });
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  if (state.kind === 'loading') return <p style={{ color: 'var(--muted)' }}>Đang tải định danh Google Maps…</p>;
  if (state.kind === 'error') return <p className={styles.alert}>{state.message}</p>;

  async function onSave() {
    const session = readSession();
    if (!session) return;
    setError(null);
    setNotice(null);

    if (!externalId.trim()) {
      setError('Nhập Google Place ID trước khi lưu.');
      return;
    }

    setBusy(true);
    try {
      let sourceId: string | undefined;
      if (newSourceTitle.trim() || newSourceUrl.trim()) {
        const source = await createSource(
          { type: 'official_website', kind: 'url', title: newSourceTitle.trim() || undefined, url: newSourceUrl.trim() || undefined },
          session.accessToken,
        );
        sourceId = source.id;
      }

      const updated = await upsertGooglePlaceId(
        placeId,
        { external_id: externalId.trim(), ...(sourceId ? { source_id: sourceId } : {}) },
        session.accessToken,
      );
      setState({ kind: 'ready', current: updated });
      setNewSourceTitle('');
      setNewSourceUrl('');
      setNotice('Đã lưu Google Place ID. Định danh CHƯA được xác minh — trang công khai vẫn dùng link tìm kiếm cho tới khi có bước xác minh riêng.');
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : 'Lưu thất bại. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  const current = state.current;

  return (
    <section aria-label="Quản lý Google Place ID" className={styles.contentEditor}>
      <h2>Google Place ID</h2>
      <p className={styles.fieldHint}>
        Dùng để mở ĐÚNG hồ sơ địa điểm trên Google Maps thay vì chỉ tìm theo tên. Nhập ID lấy từ
        trang Google Maps của chính địa điểm này (không phải một cơ sở cùng tên khác).
      </p>
      <p className={styles.fieldHint}>
        Trạng thái hiện tại:{' '}
        {current ? (
          current.verified_at ? (
            <>đã xác minh ({new Date(current.verified_at).toLocaleDateString('vi-VN')})</>
          ) : (
            'đã nhập, CHƯA xác minh — trang công khai chưa dùng ID này'
          )
        ) : (
          'chưa có'
        )}
      </p>
      <div className={styles.fieldGrid}>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Google Place ID</span>
          <input
            className={styles.input}
            type="text"
            value={externalId}
            onChange={(e) => setExternalId(e.target.value)}
            placeholder="Vd: ChIJN1t_tDeuEmsRUsoyG83frY4"
          />
        </label>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Nguồn/bằng chứng — tiêu đề (tuỳ chọn)</span>
          <input className={styles.input} type="text" value={newSourceTitle} onChange={(e) => setNewSourceTitle(e.target.value)} placeholder="Vd: Trang Google Maps của địa điểm" />
        </label>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Nguồn/bằng chứng — URL (tuỳ chọn)</span>
          <input className={styles.input} type="text" value={newSourceUrl} onChange={(e) => setNewSourceUrl(e.target.value)} placeholder="https://www.google.com/maps/place/…" />
        </label>
      </div>

      {error && <p className={styles.alert} role="alert">{error}</p>}
      {notice && <p className={styles.success} role="status">{notice}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.submitBtn} onClick={() => void onSave()} disabled={busy}>
          {busy ? 'Đang lưu…' : 'Lưu Google Place ID'}
        </button>
      </div>
    </section>
  );
}
