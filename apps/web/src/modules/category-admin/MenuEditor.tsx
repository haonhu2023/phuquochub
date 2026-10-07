'use client';

import { useEffect, useRef, useState } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import {
  getMenuManaged,
  updateMenu,
  type MenuSection,
  type MenuSectionInput,
} from '@/modules/restaurants/api/restaurants.api';
import { createSource } from '@/modules/sources/api/sources.api';
import styles from '@/modules/place-management/place-management.module.css';
import uiStyles from '@/components/ui/ui.module.css';

interface Props {
  placeId: string;
  contentVersion: number;
  onVersionChange: (v: number) => void;
}

// Món trong bản sao làm việc. Mọi chuỗi để nguyên dạng nhập; chỉ chuyển sang kiểu API khi lưu.
interface EditableItem {
  key: string;
  name: string;
  price: string; // "" = chưa có giá (KHÔNG phải 0)
  currency: string;
  unit: string; // "" = chưa rõ đơn vị
  recordedOn: string; // "" = chưa rõ ngày ghi nhận; định dạng YYYY-MM-DD
  sourceId: string | null; // nguồn đã có trong DB
  srcTitle: string; // nguồn mới (chỉ tạo khi lưu)
  srcUrl: string;
  tags: unknown;
  isSignature: boolean;
}

interface EditableSection {
  key: string;
  name: string;
  sortOrder: number;
  items: EditableItem[];
}

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready' };

const NEW_SECTION_VALUE = '__new__';
let seq = 0;
const nextKey = (p: string) => `${p}-${++seq}`;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fromApiSections(list: MenuSection[]): EditableSection[] {
  return list.map((s) => ({
    key: nextKey('sec'),
    name: s.name,
    sortOrder: s.sort_order,
    items: s.items.map((i) => ({
      key: nextKey('item'),
      name: i.name,
      price: i.price !== null ? String(i.price) : '',
      currency: i.currency || 'VND',
      unit: i.price_unit ?? '',
      recordedOn: i.price_recorded_on ?? '',
      sourceId: i.price_source?.id ?? null,
      srcTitle: '',
      srcUrl: '',
      tags: i.tags ?? null,
      isSignature: i.is_signature,
    })),
  }));
}

function newItem(name: string, isSignature: boolean): EditableItem {
  return {
    key: nextKey('item'),
    name,
    price: '',
    currency: 'VND',
    unit: '',
    recordedOn: '',
    sourceId: null,
    srcTitle: '',
    srcUrl: '',
    tags: null,
    isSignature,
  };
}

/** Lỗi đầu tiên cho một món, hoặc null. Quy tắc khớp API: không có giá thì không có đơn vị/ngày/nguồn. */
function validateItem(i: EditableItem): string | null {
  const hasPrice = i.price.trim() !== '';
  const hasMeta = i.unit.trim() !== '' || i.recordedOn.trim() !== '' || i.sourceId !== null || i.srcTitle.trim() !== '' || i.srcUrl.trim() !== '';
  if (!i.name.trim()) return 'Cần nhập tên món.';
  if (hasPrice && !/^\d+(\.\d+)?$/.test(i.price.trim())) return `"${i.name}": giá phải là số không âm.`;
  if (!hasPrice && hasMeta) return `"${i.name}": chưa có giá nên không được nhập đơn vị, ngày ghi nhận hoặc nguồn giá.`;
  if (i.recordedOn.trim() && !DATE_RE.test(i.recordedOn.trim())) return `"${i.name}": ngày ghi nhận phải theo dạng YYYY-MM-DD.`;
  if (i.recordedOn.trim() && !hasPrice) return `"${i.name}": ngày ghi nhận chỉ có khi có giá.`;
  return null;
}

/**
 * Thực đơn cho quản trị. Tải GIÁ THẬT qua GET :id/menu/managed — KHÔNG dùng route công khai (route đó xoá giá,
 * và lưu lại sẽ ghi null cho mọi giá đã có). Lưu thay TOÀN BỘ thực đơn kèm CAS; giữ đơn vị, ngày ghi nhận và nguồn
 * của mọi món. Nguồn mới được tạo trước khi lưu và TÁI DÙNG khi lưu lại sau lỗi (không tạo trùng).
 */
export function MenuEditor({ placeId, contentVersion, onVersionChange }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [sections, setSections] = useState<EditableSection[]>([]);
  const [sectionChoice, setSectionChoice] = useState<string>(NEW_SECTION_VALUE);
  const [newSectionName, setNewSectionName] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftPrice, setDraftPrice] = useState('');
  const [draftUnit, setDraftUnit] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const [draftSrcTitle, setDraftSrcTitle] = useState('');
  const [draftSrcUrl, setDraftSrcUrl] = useState('');
  const [draftSignature, setDraftSignature] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Nguồn đã tạo nhưng lưu menu chưa thành công: tái dùng id khi lưu lại (cùng tiêu đề/URL).
  const createdSources = useRef<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      const session = readSession();
      if (!session) {
        if (!cancelled) setState({ kind: 'error', message: 'Phiên đăng nhập đã hết hạn — tải lại trang.' });
        return;
      }
      getMenuManaged(placeId, session.accessToken)
        .then((list) => {
          if (cancelled) return;
          setSections(fromApiSections(list));
          setState({ kind: 'ready' });
        })
        .catch(() => {
          if (!cancelled) setState({ kind: 'error', message: 'Không tải được thực đơn. Không thể lưu cho đến khi tải lại được.' });
        });
    });
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  if (state.kind === 'loading') return <p style={{ color: 'var(--muted)' }}>Đang tải thực đơn…</p>;
  if (state.kind === 'error') return <p className={styles.alert} role="alert">{state.message}</p>;

  function patchItem(key: string, patch: Partial<EditableItem>) {
    setSections((prev) => prev.map((s) => ({ ...s, items: s.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) })));
  }

  function onAddDraft() {
    setError(null);
    setNotice(null);
    const name = draftName.trim();
    if (!name) return setError('Cần nhập tên món.');
    const targetName = sectionChoice === NEW_SECTION_VALUE ? newSectionName.trim() : sectionChoice;
    if (!targetName) return setError('Cần chọn mục có sẵn hoặc nhập tên mục mới (vd: "Hải sản", "Khai vị").');
    const item: EditableItem = {
      ...newItem(name, draftSignature),
      price: draftPrice.trim(),
      unit: draftUnit.trim(),
      recordedOn: draftDate.trim(),
      srcTitle: draftSrcTitle.trim(),
      srcUrl: draftSrcUrl.trim(),
    };
    const problem = validateItem(item);
    if (problem) return setError(problem);
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.name === targetName);
      if (idx === -1) {
        return [...prev, { key: nextKey('sec'), name: targetName, sortOrder: prev.length, items: [item] }];
      }
      return prev.map((s, i) => (i === idx ? { ...s, items: [...s.items, item] } : s));
    });
    setDraftName('');
    setDraftPrice('');
    setDraftUnit('');
    setDraftDate('');
    setDraftSrcTitle('');
    setDraftSrcUrl('');
    setDraftSignature(false);
    setNewSectionName('');
    setSectionChoice(NEW_SECTION_VALUE);
    setNotice('Đã thêm món vào bản nháp. Bấm &quot;Lưu thực đơn&quot; để ghi.');
  }

  // Tạo nguồn cho các món có tiêu đề/URL mới (tái dùng nếu đã tạo ở lần lưu trước thất bại).
  async function resolveSources(accessToken: string): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    for (const sec of sections) {
      for (const i of sec.items) {
        if (i.sourceId) {
          out.set(i.key, i.sourceId);
          continue;
        }
        const title = i.srcTitle.trim();
        const url = i.srcUrl.trim();
        if (!title && !url) {
          out.set(i.key, null);
          continue;
        }
        const cacheKey = `${title}|${url}`;
        let id = createdSources.current[cacheKey];
        if (!id) {
          const src = await createSource(
            { type: 'official_website', kind: 'url', title: title || undefined, url: url || undefined },
            accessToken,
          );
          id = src.id;
          createdSources.current[cacheKey] = id;
        }
        out.set(i.key, id);
      }
    }
    return out;
  }

  async function onSave() {
    const session = readSession();
    if (!session) return;
    setError(null);
    setNotice(null);
    for (const sec of sections) {
      if (!sec.name.trim()) return setError('Mỗi mục cần có tên.');
      for (const i of sec.items) {
        const problem = validateItem(i);
        if (problem) return setError(problem);
      }
    }
    setBusy(true);
    try {
      const sourceIds = await resolveSources(session.accessToken);
      const payload: MenuSectionInput[] = sections.map((sec) => ({
        name: sec.name,
        sort_order: sec.sortOrder,
        items: sec.items.map((i, idx) => {
          const hasPrice = i.price.trim() !== '';
          return {
            name: i.name.trim(),
            ...(hasPrice ? { price: Number(i.price.trim()), currency: i.currency || 'VND' } : {}),
            price_unit: hasPrice && i.unit.trim() ? i.unit.trim() : null,
            price_recorded_on: hasPrice && i.recordedOn.trim() ? i.recordedOn.trim() : null,
            price_source_id: hasPrice ? (sourceIds.get(i.key) ?? null) : null,
            tags: i.tags ?? undefined,
            is_signature: i.isSignature,
            sort_order: idx,
          };
        }),
      }));
      const saved = await updateMenu(placeId, payload, contentVersion, session.accessToken);
      setSections(fromApiSections(saved.sections));
      onVersionChange(saved.content_version);
      createdSources.current = {};
      setEditingKey(null);
      setNotice('Đã lưu thực đơn.');
    } catch (err) {
      // Giữ nguyên bản nháp và nguồn đã tạo (để lưu lại không trùng). 409: người khác đã sửa — không tự ghi đè.
      setError(
        err instanceof ApiError && err.status < 500
          ? err.message
          : 'Lưu thất bại. Bản nháp vẫn được giữ; vui lòng thử lại.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Thực đơn" className={styles.contentEditor}>
      <h2>Thực đơn</h2>
      <p className={styles.fieldHint}>
        Mỗi lần lưu thay TOÀN BỘ thực đơn. Giá món là <strong>chưa có giá</strong> nếu để trống — không phải miễn phí.
        Đơn vị, ngày ghi nhận và nguồn chỉ nhập khi biết; thiếu thì khách thấy là &quot;chưa rõ&quot;.
      </p>

      {sections.map((sec) => (
        <div key={sec.key} style={{ marginTop: '0.75rem' }}>
          <strong>{sec.name}</strong>
          <ul>
            {sec.items.map((i) => (
              <li key={i.key} style={{ marginTop: '0.35rem' }}>
                {i.name}
                {i.isSignature ? ' ★' : ''}
                {' — '}
                {i.price.trim() ? `${Number(i.price).toLocaleString('vi-VN')} ${i.currency}` : 'chưa có giá'}
                {i.price.trim() && (i.unit ? ` / ${i.unit}` : ' (chưa rõ đơn vị)')}
                {i.price.trim() && (i.recordedOn ? `, ghi nhận ${i.recordedOn}` : ', chưa rõ ngày ghi nhận')}
                <button
                  type="button"
                  onClick={() => setEditingKey(editingKey === i.key ? null : i.key)}
                  disabled={busy}
                  style={{ marginLeft: '0.5rem' }}
                >
                  {editingKey === i.key ? 'Đóng' : 'Sửa giá/nguồn'}
                </button>
                {editingKey === i.key && (
                  <div className={styles.fieldGrid} style={{ marginTop: '0.35rem' }}>
                    <label className={uiStyles.field}>
                      <span className={uiStyles.fieldLabel}>Giá (VND)</span>
                      <input className={styles.input} type="text" inputMode="decimal" value={i.price} onChange={(e) => patchItem(i.key, { price: e.target.value })} placeholder="Để trống = chưa có giá" />
                    </label>
                    <label className={uiStyles.field}>
                      <span className={uiStyles.fieldLabel}>Đơn vị (suất/phần/kg…)</span>
                      <input className={styles.input} type="text" value={i.unit} onChange={(e) => patchItem(i.key, { unit: e.target.value })} />
                    </label>
                    <label className={uiStyles.field}>
                      <span className={uiStyles.fieldLabel}>Ngày ghi nhận giá</span>
                      <input className={styles.input} type="date" value={i.recordedOn} onChange={(e) => patchItem(i.key, { recordedOn: e.target.value })} />
                    </label>
                    <label className={uiStyles.field}>
                      <span className={uiStyles.fieldLabel}>Nguồn giá — tiêu đề (nguồn mới)</span>
                      <input className={styles.input} type="text" value={i.srcTitle} onChange={(e) => patchItem(i.key, { srcTitle: e.target.value })} />
                    </label>
                    <label className={uiStyles.field}>
                      <span className={uiStyles.fieldLabel}>Nguồn giá — URL (nguồn mới)</span>
                      <input className={styles.input} type="url" value={i.srcUrl} onChange={(e) => patchItem(i.key, { srcUrl: e.target.value })} />
                    </label>
                    <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                      Nguồn hiện có: {i.sourceId ? 'đã gắn nguồn' : 'chưa có nguồn'}.
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <h3 style={{ marginTop: '1rem' }}>Thêm món</h3>
      <div className={styles.fieldGrid} style={{ marginTop: '0.5rem' }}>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Mục</span>
          <select className={styles.input} value={sectionChoice} onChange={(e) => setSectionChoice(e.target.value)}>
            <option value={NEW_SECTION_VALUE}>+ Mục mới…</option>
            {sections.map((s) => (
              <option key={s.key} value={s.name}>{s.name}</option>
            ))}
          </select>
        </label>
        {sectionChoice === NEW_SECTION_VALUE && (
          <label className={uiStyles.field}>
            <span className={uiStyles.fieldLabel}>Tên mục mới</span>
            <input className={styles.input} type="text" value={newSectionName} onChange={(e) => setNewSectionName(e.target.value)} placeholder="Vd: Hải sản, Khai vị" />
          </label>
        )}
      </div>
      <div className={styles.fieldGrid} style={{ marginTop: '0.5rem' }}>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Tên món</span>
          <input className={styles.input} type="text" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
        </label>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Giá (VND) — để trống nếu chưa có</span>
          <input className={styles.input} type="text" inputMode="decimal" value={draftPrice} onChange={(e) => setDraftPrice(e.target.value)} />
        </label>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Đơn vị (suất/phần/kg…)</span>
          <input className={styles.input} type="text" value={draftUnit} onChange={(e) => setDraftUnit(e.target.value)} />
        </label>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Ngày ghi nhận giá</span>
          <input className={styles.input} type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} />
        </label>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Nguồn giá — tiêu đề</span>
          <input className={styles.input} type="text" value={draftSrcTitle} onChange={(e) => setDraftSrcTitle(e.target.value)} />
        </label>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Nguồn giá — URL</span>
          <input className={styles.input} type="url" value={draftSrcUrl} onChange={(e) => setDraftSrcUrl(e.target.value)} />
        </label>
      </div>
      <label className={styles.checkboxField} style={{ marginTop: '0.5rem' }}>
        <input type="checkbox" checked={draftSignature} onChange={(e) => setDraftSignature(e.target.checked)} />
        <span>Món nổi bật</span>
      </label>
      <div style={{ marginTop: '0.5rem' }}>
        <button type="button" onClick={onAddDraft} disabled={busy}>Thêm vào bản nháp</button>
      </div>

      {error && <p className={styles.alert} role="alert">{error}</p>}
      {notice && <p className={styles.success} role="status">{notice}</p>}

      <div className={styles.actions} style={{ marginTop: '0.75rem' }}>
        <button type="button" className={styles.submitBtn} onClick={() => void onSave()} disabled={busy}>
          {busy ? 'Đang lưu…' : 'Lưu thực đơn'}
        </button>
      </div>
    </section>
  );
}
