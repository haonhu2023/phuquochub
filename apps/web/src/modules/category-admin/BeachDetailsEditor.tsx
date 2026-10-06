'use client';

import { useEffect, useRef, useState } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import {
  getBeachDetailsAdmin,
  updateBeachDetails,
  type BeachDetails,
  type BeachSource,
} from '@/modules/beaches/api/beaches.api';
import { createSource } from '@/modules/sources/api/sources.api';
import styles from '@/modules/place-management/place-management.module.css';
import uiStyles from '@/components/ui/ui.module.css';

interface Props {
  placeId: string;
  // CAS thật — token `places.content_version` do EditPlaceView giữ (cùng khuôn RestaurantDetailsEditor).
  contentVersion: number;
  onVersionChange: (v: number) => void;
}

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready' };

type SourcedField = 'best_season' | 'lifeguard_info';
type SourceDraft = { title: string; url: string };

const SOURCED_LABEL: Record<SourcedField, string> = {
  best_season: 'Mùa tham khảo',
  lifeguard_info: 'Thông tin cứu hộ',
};

const EMPTY_DRAFT: SourceDraft = { title: '', url: '' };

function sourceText(src: BeachSource): string {
  return src.title ?? src.url ?? '(không có tiêu đề)';
}

function textOrNull(v: string): string | null {
  const t = v.trim();
  return t ? t : null;
}

/**
 * Nhóm trường riêng của Bãi biển (đường vào, đặc điểm, dịch vụ, mùa tham khảo, cứu hộ) — nhúng vào
 * EditPlaceView (chỉ khi category_slug='beach'). PATCH có CAS. "Mùa tham khảo" và "cứu hộ" chỉ có
 * nguồn khi người quản trị nhập tên/URL nguồn (tạo nguồn mới rồi gửi source_id), không suy đoán.
 */
export function BeachDetailsEditor({ placeId, contentVersion, onVersionChange }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [accessRoute, setAccessRoute] = useState('');
  const [characteristics, setCharacteristics] = useState('');
  const [services, setServices] = useState('');
  const [bestSeason, setBestSeason] = useState('');
  const [lifeguardInfo, setLifeguardInfo] = useState('');
  const [sources, setSources] = useState<Record<SourcedField, BeachSource | null>>({
    best_season: null,
    lifeguard_info: null,
  });
  const [drafts, setDrafts] = useState<Record<SourcedField, SourceDraft>>({
    best_season: EMPTY_DRAFT,
    lifeguard_info: EMPTY_DRAFT,
  });
  // Nguồn đã tạo nhưng PATCH chưa thành công: tái dùng id khi retry với cùng tên/URL, không tạo trùng.
  const createdSources = useRef<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyDetails(d: BeachDetails | null) {
    setAccessRoute(d?.access_route ?? '');
    setCharacteristics(d?.characteristics ?? '');
    setServices(d?.services ?? '');
    setBestSeason(d?.best_season ?? '');
    setLifeguardInfo(d?.lifeguard_info ?? '');
    setSources({ best_season: d?.best_season_source ?? null, lifeguard_info: d?.lifeguard_info_source ?? null });
  }

  useEffect(() => {
    let cancelled = false;
    // Trì hoãn qua microtask — cùng khuôn RestaurantDetailsEditor (tránh set-state-in-effect đồng bộ).
    void Promise.resolve().then(() => {
      const session = readSession();
      if (!session) {
        if (!cancelled) setState({ kind: 'error', message: 'Phiên đăng nhập đã hết hạn — tải lại trang.' });
        return;
      }
      getBeachDetailsAdmin(placeId, session.accessToken)
        .then((d) => {
          if (cancelled) return;
          applyDetails(d);
          setState({ kind: 'ready' });
        })
        .catch(() => {
          if (!cancelled) setState({ kind: 'error', message: 'Không tải được thông tin bãi biển.' });
        });
    });
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  if (state.kind === 'loading') return <p style={{ color: 'var(--muted)' }}>Đang tải thông tin bãi biển…</p>;
  if (state.kind === 'error') return <p className={styles.alert}>{state.message}</p>;

  function setDraft(field: SourcedField, key: keyof SourceDraft, value: string) {
    setDrafts((prev) => ({ ...prev, [field]: { ...prev[field], [key]: value } }));
  }

  // Chỉ tạo nguồn khi người quản trị thật sự nhập tên hoặc URL; trống → không gửi source_id (giữ nguyên).
  async function sourceIdFor(field: SourcedField, accessToken: string): Promise<string | undefined> {
    const draft = drafts[field];
    if (!draft.title.trim() && !draft.url.trim()) return undefined;
    const key = field + '|' + draft.title.trim() + '|' + draft.url.trim();
    const cached = createdSources.current[key];
    if (cached) return cached;
    const source = await createSource(
      { type: 'official_website', kind: 'url', title: draft.title.trim() || undefined, url: draft.url.trim() || undefined },
      accessToken,
    );
    createdSources.current[key] = source.id;
    return source.id;
  }

  async function onSave() {
    const session = readSession();
    if (!session) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const bestSeasonSourceId = await sourceIdFor('best_season', session.accessToken);
      const lifeguardSourceId = await sourceIdFor('lifeguard_info', session.accessToken);
      const updated = await updateBeachDetails(
        placeId,
        {
          expected_content_version: contentVersion,
          access_route: textOrNull(accessRoute),
          characteristics: textOrNull(characteristics),
          services: textOrNull(services),
          best_season: textOrNull(bestSeason),
          lifeguard_info: textOrNull(lifeguardInfo),
          ...(bestSeasonSourceId ? { best_season_source_id: bestSeasonSourceId } : {}),
          ...(lifeguardSourceId ? { lifeguard_info_source_id: lifeguardSourceId } : {}),
        },
        session.accessToken,
      );
      applyDetails(updated);
      setDrafts({ best_season: EMPTY_DRAFT, lifeguard_info: EMPTY_DRAFT });
      createdSources.current = {};
      onVersionChange(updated.content_version);
      setNotice('Đã lưu thông tin bãi biển.');
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : 'Lưu thất bại. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  function renderSourced(field: SourcedField, value: string, setValue: (v: string) => void, placeholder: string) {
    const current = sources[field];
    return (
      <div style={{ marginTop: '0.75rem' }}>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>{SOURCED_LABEL[field]}</span>
          <input className={styles.input} type="text" value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} />
        </label>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0.35rem 0' }}>
          Nguồn hiện tại: {current ? sourceText(current) : 'chưa có nguồn'}
        </p>
        <div className={styles.fieldGrid}>
          <input
            className={styles.input}
            type="text"
            value={drafts[field].title}
            onChange={(e) => setDraft(field, 'title', e.target.value)}
            placeholder="Tên nguồn mới (tuỳ chọn)"
          />
          <input
            className={styles.input}
            type="url"
            value={drafts[field].url}
            onChange={(e) => setDraft(field, 'url', e.target.value)}
            placeholder="https://…"
          />
        </div>
      </div>
    );
  }

  return (
    <section aria-label="Thông tin bãi biển" className={styles.contentEditor}>
      <h2>Thông tin bãi biển</h2>

      <label className={uiStyles.field} style={{ marginTop: '0.75rem' }}>
        <span className={uiStyles.fieldLabel}>Đường vào (cách đi tới bãi)</span>
        <input className={styles.input} type="text" value={accessRoute} onChange={(e) => setAccessRoute(e.target.value)} />
      </label>

      <label className={uiStyles.field} style={{ marginTop: '0.75rem' }}>
        <span className={uiStyles.fieldLabel}>Đặc điểm bãi</span>
        <input className={styles.input} type="text" value={characteristics} onChange={(e) => setCharacteristics(e.target.value)} />
      </label>

      <label className={uiStyles.field} style={{ marginTop: '0.75rem' }}>
        <span className={uiStyles.fieldLabel}>Dịch vụ tại bãi</span>
        <input className={styles.input} type="text" value={services} onChange={(e) => setServices(e.target.value)} />
      </label>

      {renderSourced('best_season', bestSeason, setBestSeason, 'Vd: Tháng 11 đến tháng 4')}
      {renderSourced('lifeguard_info', lifeguardInfo, setLifeguardInfo, 'Vd: Có trạm cứu hộ mùa cao điểm')}

      {error && <p className={styles.alert} role="alert">{error}</p>}
      {notice && <p className={styles.success} role="status">{notice}</p>}

      <div className={styles.actions} style={{ marginTop: '0.75rem' }}>
        <button type="button" className={styles.submitBtn} onClick={() => void onSave()} disabled={busy}>
          {busy ? 'Đang lưu…' : 'Lưu thông tin bãi biển'}
        </button>
      </div>
    </section>
  );
}
