'use client';

import { useEffect, useState } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { getMenu, updateMenu, type MenuSection, type MenuSectionInput } from '@/modules/restaurants/api/restaurants.api';
import styles from '@/modules/place-management/place-management.module.css';
import uiStyles from '@/components/ui/ui.module.css';

interface Props {
  placeId: string;
}

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; sections: MenuSection[] };

const NEW_SECTION_VALUE = '__new__';

/**
 * `restaurant_menu_items` KHÔNG append-only (khác price_history) — PATCH :id/menu THAY TOÀN BỘ
 * mảng `sections` mỗi lần gọi (replace-all, RestaurantsRepository.replaceMenu). Component này vì
 * vậy luôn gửi lại ĐÚNG danh sách hiện có cộng món vừa thêm, không có khái niệm "chỉ gửi phần mới".
 *
 * Giá món ăn ở đây KHÔNG đi qua được cổng tin cậy nào — `restaurant_menu_items` không có cột
 * verification/trust riêng (fail-closed theo thiết kế, xem restaurants.service.ts), nên public GET
 * :id/menu luôn null hoá `price` của MỌI món, kể cả khi place đã verified. Vì vậy giá nhập ở đây
 * CHỈ actor xem được, không có "chờ xác minh" nào để chờ — ghi rõ trên UI để không ai hiểu lầm đây
 * là một hàng đợi tạm thời giống PricesEditor.
 */
export function MenuEditor({ placeId }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [sectionChoice, setSectionChoice] = useState<string>(NEW_SECTION_VALUE);
  const [newSectionName, setNewSectionName] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [isSignature, setIsSignature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMenu(placeId)
      .then((sections) => {
        if (!cancelled) setState({ kind: 'ready', sections });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error', message: 'Không tải được thực đơn.' });
      });
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  if (state.kind === 'loading') return <p style={{ color: 'var(--muted)' }}>Đang tải thực đơn…</p>;
  if (state.kind === 'error') return <p className={styles.alert}>{state.message}</p>;

  async function onAddItem() {
    const session = readSession();
    if (!session) return;
    setError(null);
    setNotice(null);

    const trimmedItemName = itemName.trim();
    if (!trimmedItemName) {
      setError('Cần nhập tên món.');
      return;
    }
    const targetSectionName = sectionChoice === NEW_SECTION_VALUE ? newSectionName.trim() : sectionChoice;
    if (!targetSectionName) {
      setError('Cần chọn mục có sẵn hoặc nhập tên mục mới (vd: "Hải sản", "Khai vị").');
      return;
    }

    const current = (state as { kind: 'ready'; sections: MenuSection[] }).sections;
    const newItem = {
      name: trimmedItemName,
      price: itemPrice.trim() ? Number(itemPrice) : undefined,
      is_signature: isSignature,
    };

    // UpdateRestaurantMenuDto's MenuItemDto KHÔNG có trường `id` (replace-all tái tạo toàn bộ) và
    // ValidationPipe toàn cục chạy forbidNonWhitelisted:true — gửi lại nguyên object `MenuItem` đọc
    // từ GET (có `id`) sẽ bị BACKEND TỪ CHỐI 400. Phải lọc về đúng hình dạng DTO cho phép trước khi
    // gộp món mới vào mảng hiện có.
    const toInput = (i: (typeof current)[number]['items'][number]) => ({
      name: i.name,
      price: i.price ?? undefined,
      currency: i.currency,
      tags: i.tags ?? undefined,
      is_signature: i.is_signature,
      sort_order: i.sort_order,
    });

    // Mọi mục KHÁC mục đang sửa cũng phải gửi lại (replace-all) — qua ĐÚNG `toInput` như mục đang
    // sửa, không chỉ mục có món mới mới cần lọc bỏ `id`.
    const existingIdx = current.findIndex((s) => s.name === targetSectionName);
    const nextSections: MenuSectionInput[] =
      existingIdx === -1
        ? [
            ...current.map((s) => ({ name: s.name, sort_order: s.sort_order, items: s.items.map(toInput) })),
            { name: targetSectionName, items: [newItem] },
          ]
        : current.map((s, idx) => ({
            name: s.name,
            sort_order: s.sort_order,
            items: idx === existingIdx ? [...s.items.map(toInput), newItem] : s.items.map(toInput),
          }));

    setBusy(true);
    try {
      const saved = await updateMenu(placeId, nextSections, session.accessToken);
      setState({ kind: 'ready', sections: saved });
      setItemName('');
      setItemPrice('');
      setIsSignature(false);
      setNewSectionName('');
      setSectionChoice(NEW_SECTION_VALUE);
      setNotice('Đã lưu thực đơn. Giá món KHÔNG hiện công khai (xem ghi chú bên dưới) — chỉ tên món/mục hiện cho khách.');
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : 'Lưu thất bại. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Thực đơn" className={styles.contentEditor}>
      <h2>Thực đơn</h2>
      <p className={styles.fieldHint}>
        Mỗi lần lưu thay TOÀN BỘ thực đơn hiện có (không phải thêm riêng từng món). Giá món ăn <strong>không có
        bước xác minh</strong> và <strong>không bao giờ hiện công khai</strong> — public chỉ thấy tên món, mục,
        và món nổi bật; giá chỉ bạn (đã đăng nhập) nhìn thấy ở đây để tự quản lý nội bộ.
      </p>

      {state.sections.length > 0 && (
        <ul className={styles.list}>
          {state.sections.map((s) => (
            <li key={s.id} className={styles.listItem} style={{ display: 'block' }}>
              <strong>{s.name}</strong>
              <ul>
                {s.items.map((i) => (
                  <li key={i.id}>
                    {i.name}
                    {i.is_signature ? ' ★' : ''}
                    {i.price !== null ? ` — ${i.price.toLocaleString('vi-VN')} ${i.currency} (nội bộ)` : ''}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.fieldGrid} style={{ marginTop: '0.75rem' }}>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Mục</span>
          <select
            className={styles.input}
            value={sectionChoice}
            onChange={(e) => setSectionChoice(e.target.value)}
          >
            <option value={NEW_SECTION_VALUE}>+ Mục mới…</option>
            {state.sections.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {sectionChoice === NEW_SECTION_VALUE && (
          <label className={uiStyles.field}>
            <span className={uiStyles.fieldLabel}>Tên mục mới</span>
            <input
              className={styles.input}
              type="text"
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              placeholder="Vd: Hải sản, Khai vị, Món chính"
            />
          </label>
        )}
      </div>

      <div className={styles.fieldGrid} style={{ marginTop: '0.5rem' }}>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Tên món</span>
          <input
            className={styles.input}
            type="text"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="Vd: Ghẹ rang muối"
          />
        </label>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Giá (VND, nội bộ — không công khai)</span>
          <input
            className={styles.input}
            type="number"
            min={0}
            value={itemPrice}
            onChange={(e) => setItemPrice(e.target.value)}
          />
        </label>
      </div>

      <label className={styles.checkboxField} style={{ marginTop: '0.5rem' }}>
        <input type="checkbox" checked={isSignature} onChange={(e) => setIsSignature(e.target.checked)} />
        <span>Món nổi bật</span>
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

      <div className={styles.actions} style={{ marginTop: '0.75rem' }}>
        <button type="button" className={styles.submitBtn} onClick={() => void onAddItem()} disabled={busy}>
          {busy ? 'Đang lưu…' : 'Thêm món'}
        </button>
      </div>
    </section>
  );
}
