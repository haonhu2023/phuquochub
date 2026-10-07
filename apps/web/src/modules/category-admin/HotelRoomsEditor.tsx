'use client';

import { useEffect, useState } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import {
  getHotelRoomsManaged,
  updateHotelRooms,
  type HotelRoom,
  type HotelRoomInput,
} from '@/modules/hotels/api/hotels.api';
import styles from '@/modules/place-management/place-management.module.css';
import uiStyles from '@/components/ui/ui.module.css';

interface Props {
  placeId: string;
  // Cùng token places.content_version với HotelDetailsEditor (do EditPlaceView giữ): lưu phòng và lưu chi tiết
  // dùng chung một version — sau mỗi lần lưu, cha cập nhật token và editor còn lại dùng token mới.
  contentVersion: number;
  onVersionChange: (v: number) => void;
}

// Dòng nhập (chuỗi) — tách khỏi dữ liệu API để không đoán giá trị khi trống.
interface RowDraft {
  key: string;
  id: string | null;
  name: string;
  capacity: string;
  price: string;
  currency: string;
  validFrom: string;
  validTo: string;
}

type LoadState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready' };

let keySeq = 0;
const nextKey = () => `row-${++keySeq}`;

function toDraft(r: HotelRoom): RowDraft {
  return {
    key: nextKey(),
    id: r.id,
    name: r.name,
    capacity: r.capacity != null ? String(r.capacity) : '',
    price: r.price_ref != null ? String(r.price_ref) : '',
    currency: r.currency ?? 'VND',
    validFrom: r.valid_from ?? '',
    validTo: r.valid_to ?? '',
  };
}

function emptyDraft(): RowDraft {
  return { key: nextKey(), id: null, name: '', capacity: '', price: '', currency: 'VND', validFrom: '', validTo: '' };
}

/** Trả lỗi đầu tiên (chuỗi tiếng Việt) hoặc null nếu hợp lệ. Giá trống là "chưa có giá", KHÔNG phải 0. */
function validateRows(rows: RowDraft[]): string | null {
  for (const [i, r] of rows.entries()) {
    const label = `Phòng ${i + 1}`;
    if (!r.name.trim()) return `${label}: cần nhập tên phòng.`;
    if (r.capacity.trim() && !/^\d+$/.test(r.capacity.trim())) return `${label}: sức chứa phải là số nguyên dương.`;
    if (r.capacity.trim() && Number(r.capacity) < 1) return `${label}: sức chứa phải từ 1 trở lên.`;
    if (r.price.trim() && !/^\d+(\.\d+)?$/.test(r.price.trim())) return `${label}: giá phải là số không âm.`;
  }
  return null;
}

function toInput(r: RowDraft, sortOrder: number): HotelRoomInput {
  const price = r.price.trim() ? Number(r.price.trim()) : null;
  return {
    name: r.name.trim(),
    capacity: r.capacity.trim() ? Number(r.capacity.trim()) : null,
    price_ref: price,
    // Đơn vị tiền chỉ gửi khi có giá; giá trống không kèm đơn vị (không tự khẳng định VND cho "chưa có giá").
    ...(price !== null ? { currency: r.currency || 'VND' } : {}),
    valid_from: r.validFrom.trim() || null,
    valid_to: r.validTo.trim() || null,
    sort_order: sortOrder,
  };
}

/**
 * Danh sách phòng khách sạn (admin). Tải GIÁ THẬT qua GET :id/rooms/managed trước khi cho sửa; nếu tải lỗi
 * hoặc đang tải thì KHÔNG cho lưu (tránh ghi danh sách rỗng/giá null). Lưu thay toàn bộ danh sách kèm CAS.
 */
export function HotelRoomsEditor({ placeId, contentVersion, onVersionChange }: Props) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [rows, setRows] = useState<RowDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      const session = readSession();
      if (!session) {
        if (!cancelled) setState({ kind: 'error', message: 'Phiên đăng nhập đã hết hạn — tải lại trang.' });
        return;
      }
      getHotelRoomsManaged(placeId, session.accessToken)
        .then((list) => {
          if (cancelled) return;
          setRows(list.map(toDraft));
          setState({ kind: 'ready' });
        })
        .catch(() => {
          if (!cancelled) setState({ kind: 'error', message: 'Không tải được danh sách phòng. Không thể lưu cho đến khi tải lại được.' });
        });
    });
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  if (state.kind === 'loading') return <p style={{ color: 'var(--muted)' }}>Đang tải danh sách phòng…</p>;
  if (state.kind === 'error') return <p className={styles.alert} role="alert">{state.message}</p>;

  function update(key: string, patch: Partial<RowDraft>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  async function onSave() {
    const session = readSession();
    if (!session) return;
    setError(null);
    setNotice(null);
    const problem = validateRows(rows);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      const result = await updateHotelRooms(
        placeId,
        { expected_content_version: contentVersion, rooms: rows.map((r, i) => toInput(r, i)) },
        session.accessToken,
      );
      setRows(result.rooms.map(toDraft));
      onVersionChange(result.content_version);
      setNotice('Đã lưu danh sách phòng.');
    } catch (err) {
      // 409/lỗi: giữ nguyên dòng đang nhập, không ghi đè, không tự thử lại.
      setError(err instanceof ApiError && err.status < 500 ? err.message : 'Lưu thất bại. Nội dung vẫn được giữ, vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Danh sách phòng" className={styles.contentEditor}>
      <h2>Phòng và giá tham khảo</h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Để trống giá nghĩa là chưa có giá — không phải miễn phí.</p>

      {rows.length === 0 && <p style={{ color: 'var(--muted)' }}>Chưa có phòng nào.</p>}

      {rows.map((r, i) => (
        <fieldset key={r.key} style={{ marginTop: '0.75rem', border: '1px solid var(--border, #ddd)', padding: '0.5rem' }}>
          <legend>Phòng {i + 1}</legend>
          <label className={uiStyles.field}>
            <span className={uiStyles.fieldLabel}>Tên phòng</span>
            <input className={styles.input} type="text" value={r.name} onChange={(e) => update(r.key, { name: e.target.value })} />
          </label>
          <label className={uiStyles.field} style={{ marginTop: '0.5rem' }}>
            <span className={uiStyles.fieldLabel}>Sức chứa (khách)</span>
            <input className={styles.input} type="text" inputMode="numeric" value={r.capacity} onChange={(e) => update(r.key, { capacity: e.target.value })} placeholder="Để trống nếu chưa rõ" />
          </label>
          <label className={uiStyles.field} style={{ marginTop: '0.5rem' }}>
            <span className={uiStyles.fieldLabel}>Giá tham khảo (đồng/đêm)</span>
            <input className={styles.input} type="text" inputMode="decimal" value={r.price} onChange={(e) => update(r.key, { price: e.target.value })} placeholder="Để trống = chưa có giá" />
          </label>
          <label className={uiStyles.field} style={{ marginTop: '0.5rem' }}>
            <span className={uiStyles.fieldLabel}>Áp dụng từ (YYYY-MM-DD)</span>
            <input className={styles.input} type="date" value={r.validFrom} onChange={(e) => update(r.key, { validFrom: e.target.value })} />
          </label>
          <label className={uiStyles.field} style={{ marginTop: '0.5rem' }}>
            <span className={uiStyles.fieldLabel}>Áp dụng đến (YYYY-MM-DD)</span>
            <input className={styles.input} type="date" value={r.validTo} onChange={(e) => update(r.key, { validTo: e.target.value })} />
          </label>
          <div style={{ marginTop: '0.5rem' }}>
            <button type="button" onClick={() => removeRow(r.key)} disabled={busy}>
              Bỏ phòng này khỏi danh sách
            </button>
          </div>
        </fieldset>
      ))}

      <div style={{ marginTop: '0.75rem' }}>
        <button type="button" onClick={() => setRows((prev) => [...prev, emptyDraft()])} disabled={busy}>
          + Thêm phòng
        </button>
      </div>

      {error && <p className={styles.alert} role="alert">{error}</p>}
      {notice && <p className={styles.success} role="status">{notice}</p>}

      <div className={styles.actions} style={{ marginTop: '0.75rem' }}>
        <button type="button" className={styles.submitBtn} onClick={() => void onSave()} disabled={busy}>
          {busy ? 'Đang lưu…' : 'Lưu danh sách phòng'}
        </button>
      </div>
    </section>
  );
}
