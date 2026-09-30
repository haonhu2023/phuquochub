'use client';

import { useEffect, useState } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { createPlacePrice, listPlacePrices, type PlacePrice } from '@/modules/prices/api/prices.api';
import { canDisplayPrice, PRICE_VERIFYING_TEXT } from '@/modules/places/trust';
import styles from '@/modules/place-management/place-management.module.css';
import uiStyles from '@/components/ui/ui.module.css';

interface Props {
  placeId: string;
}

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; prices: PlacePrice[] };

/**
 * price_history (SSOT giá, ADR-006/ADR-019) — dùng CHUNG mọi category (hotel "giá tham khảo/phòng/
 * đêm", nhà hàng "giá/người", …), KHÔNG phải bảng giá riêng của category nào. Append-only: THÊM một
 * bản ghi mới khi giá đổi, KHÔNG sửa/xoá bản cũ (đúng ý nghĩa "history" — cũng là lý do component
 * này không có nút sửa/xoá, chỉ có "Thêm"). Bản mới nhập luôn ở trạng thái `pending` (chưa xác
 * minh) — amount CHỈ hiển thị công khai sau khi qua đúng luồng xác minh hiện có
 * (verification_status -> verified/official/community_verified), không phải khi vừa lưu xong.
 */
export function PricesEditor({ placeId }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [serviceName, setServiceName] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('');
  const [isFree, setIsFree] = useState(false);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPlacePrices(placeId)
      .then((prices) => {
        if (!cancelled) setState({ kind: 'ready', prices });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error', message: 'Không tải được danh sách giá.' });
      });
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  if (state.kind === 'loading') return <p style={{ color: 'var(--muted)' }}>Đang tải giá…</p>;
  if (state.kind === 'error') return <p className={styles.alert}>{state.message}</p>;

  async function onAdd() {
    const session = readSession();
    if (!session) return;
    setError(null);
    setNotice(null);

    if (!serviceName.trim()) {
      setError('Cần nhập tên khoản giá (vd: "Giá phòng/đêm", "Giá/người").');
      return;
    }
    if (!isFree && !amount.trim()) {
      setError('Cần nhập số tiền, hoặc đánh dấu "Miễn phí".');
      return;
    }

    setBusy(true);
    try {
      const created = await createPlacePrice(
        placeId,
        {
          service_name: serviceName.trim(),
          amount: isFree ? 0 : Number(amount),
          unit: unit.trim() || undefined,
          is_free: isFree,
          description: description.trim() || undefined,
        },
        session.accessToken,
      );
      // Bản vừa tạo trả về KHÔNG bị redact (actor thấy đúng giá trị vừa nhập, dù chưa xác minh) —
      // xem PricesEditor's ghi chú đầu file.
      setState({ kind: 'ready', prices: [created, ...(state as { kind: 'ready'; prices: PlacePrice[] }).prices] });
      setServiceName('');
      setAmount('');
      setUnit('');
      setIsFree(false);
      setDescription('');
      setNotice('Đã lưu — chờ xác minh để hiện công khai (xem dòng "Đang chờ xác minh" bên dưới).');
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : 'Lưu thất bại. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Giá tham khảo" className={styles.contentEditor}>
      <h2>Giá tham khảo</h2>
      <p className={styles.fieldHint}>
        Mỗi lần đổi giá, thêm MỘT dòng mới (không sửa dòng cũ) — giữ lại lịch sử giá đã áp dụng. Giá mới nhập
        chưa hiện công khai ngay; cần qua bước xác minh (nguồn/kiểm tra) trước khi khách nhìn thấy.
      </p>

      {state.prices.length > 0 && (
        <ul className={styles.list}>
          {state.prices.map((p) => (
            <li key={p.id} className={styles.listItem}>
              <span>{p.service_name}</span>
              <span>
                {canDisplayPrice(p.verification_status) ? (
                  p.is_free ? (
                    'Miễn phí'
                  ) : p.amount !== null ? (
                    `${p.amount.toLocaleString('vi-VN')} ${p.currency}${p.unit ? ` / ${p.unit}` : ''}`
                  ) : null
                ) : (
                  <em>{PRICE_VERIFYING_TEXT}</em>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.fieldGrid} style={{ marginTop: '0.75rem' }}>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Tên khoản giá</span>
          <input
            className={styles.input}
            type="text"
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
            placeholder="Vd: Giá phòng/đêm, Giá/người"
          />
        </label>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Số tiền (VND)</span>
          <input
            className={styles.input}
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isFree}
          />
        </label>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Đơn vị (tuỳ chọn)</span>
          <input
            className={styles.input}
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="Vd: đêm, người, vé"
          />
        </label>
      </div>

      <label className={styles.checkboxField} style={{ marginTop: '0.5rem' }}>
        <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} />
        <span>Miễn phí</span>
      </label>

      <label className={uiStyles.field} style={{ marginTop: '0.5rem' }}>
        <span className={uiStyles.fieldLabel}>Điều kiện áp dụng (tuỳ chọn)</span>
        <input
          className={styles.input}
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Vd: áp dụng cuối tuần, đã gồm thuế phí"
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

      <div className={styles.actions} style={{ marginTop: '0.75rem' }}>
        <button type="button" className={styles.submitBtn} onClick={() => void onAdd()} disabled={busy}>
          {busy ? 'Đang lưu…' : 'Thêm giá'}
        </button>
      </div>
    </section>
  );
}
