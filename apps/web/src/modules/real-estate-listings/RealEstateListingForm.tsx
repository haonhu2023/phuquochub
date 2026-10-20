'use client';

import { useState, type FormEvent } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { createRealEstateListing, updateRealEstateListing } from './api/real-estate-listings.api';
import {
  REAL_ESTATE_ADDRESS_PRECISIONS,
  REAL_ESTATE_FURNITURE_STATUSES,
  REAL_ESTATE_FURNITURE_STATUS_LABELS,
  REAL_ESTATE_POSTER_ROLES,
  REAL_ESTATE_PROPERTY_TYPES,
  REAL_ESTATE_RENT_PERIODS,
  REAL_ESTATE_RENT_PERIOD_LABELS,
  REAL_ESTATE_SALE_PRICE_BASES,
  REAL_ESTATE_SALE_PRICE_BASIS_LABELS,
  REAL_ESTATE_TRANSACTION_TYPES,
  realEstatePosterRoleLabel,
  realEstatePropertyTypeLabel,
  realEstateTransactionTypeLabel,
  type RealEstateListingSenderView,
  type UpsertRealEstateListingInput,
} from './types';
import { RichDescriptionEditor } from '../rich-doc/RichDescriptionEditor';
import { plainTextToRichDoc } from '../rich-doc/legacy';
import uiStyles from '@/components/ui/ui.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';

interface Props {
  existing?: RealEstateListingSenderView;
  onSaved: (saved: RealEstateListingSenderView) => void;
}

function toInput(v?: RealEstateListingSenderView): UpsertRealEstateListingInput {
  if (!v) {
    return {
      poster_role: 'owner',
      transaction_type: 'rent',
      property_type: 'room',
      title: '',
      contact_method: '',
      contact_value: '',
    };
  }
  return {
    poster_role: v.poster_role,
    transaction_type: v.transaction_type,
    property_type: v.property_type,
    title: v.title,
    ward: v.ward,
    address_precision: v.address_precision,
    address_text: v.address_text,
    lat: v.lat,
    lng: v.lng,
    area_sqm: v.area_sqm,
    price: v.price,
    price_currency: v.price_currency,
    rent_period: v.rent_period,
    sale_price_basis: v.sale_price_basis,
    deposit_amount: v.deposit_amount,
    utilities_note: v.utilities_note,
    // CHỦ Ý giữ nguyên (KHÔNG mồi từ plain text ở đây) — xem JSX's ghi chú: mồi chỉ ảnh hưởng
    // NHỮNG GÌ EDITOR HIỂN THỊ, không ảnh hưởng gì được GỬI ĐI cho tới khi người dùng thực sự soạn.
    utilities_note_rich: v.utilities_note_rich,
    furniture_status: v.furniture_status,
    move_in_date: v.move_in_date,
    lease_term_months: v.lease_term_months,
    legal_status_note: v.legal_status_note,
    legal_status_note_rich: v.legal_status_note_rich,
    description: v.description,
    description_rich: v.description_rich,
    contact_method: v.contact_method,
    contact_value: v.contact_value,
    expires_at: v.expires_at,
  };
}

// Form tạo/sửa tin bất động sản — field theo giao dịch (thuê/bán) hiện/ẩn theo transaction_type,
// khớp CHECK constraint phía DB (chk_rel_rent_fields_scope/chk_rel_sale_fields_scope) — chuyển
// giao dịch xoá sạch field thuộc nhánh cũ để không gửi lên một tổ hợp DB sẽ từ chối.
export function RealEstateListingForm({ existing, onSaved }: Props) {
  const [input, setInput] = useState<UpsertRealEstateListingInput>(toInput(existing));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof UpsertRealEstateListingInput>(key: K, value: UpsertRealEstateListingInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  function setTransactionType(next: UpsertRealEstateListingInput['transaction_type']) {
    setInput((prev) => ({
      ...prev,
      transaction_type: next,
      rent_period: null,
      deposit_amount: null,
      move_in_date: null,
      lease_term_months: null,
      sale_price_basis: null,
      legal_status_note: null,
    }));
  }

  function setNumberOrNull(key: keyof UpsertRealEstateListingInput, raw: string) {
    set(key, (raw.trim() === '' ? null : Number(raw)) as never);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    const session = readSession();
    if (!session) {
      setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    const payload: UpsertRealEstateListingInput = {
      ...input,
      title: input.title.trim(),
      ward: input.ward?.trim() || null,
      address_text: input.address_text?.trim() || null,
      price_currency: input.price_currency?.trim().toUpperCase() || null,
      utilities_note: input.utilities_note?.trim() || null,
      legal_status_note: input.legal_status_note?.trim() || null,
      description: input.description?.trim() || null,
      contact_method: input.contact_method.trim(),
      contact_value: input.contact_value.trim(),
      expires_at: input.expires_at?.trim() || null,
    };

    setSubmitting(true);
    try {
      const saved = existing
        ? await updateRealEstateListing(existing.id, payload, session.accessToken)
        : await createRealEstateListing(payload, session.accessToken);
      onSaved(saved);
    } catch (err) {
      setError(formErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const isRent = input.transaction_type === 'rent';

  return (
    <form className={placeMgmtStyles.form} onSubmit={handleSubmit} aria-busy={submitting}>
      {error && (
        <p className={placeMgmtStyles.alert} role="alert">
          {error}
        </p>
      )}

      {existing && existing.status === 'published' && (
        <p className={placeMgmtStyles.fieldHint}>
          Tin đang đăng — lưu thay đổi sẽ ẩn tin khỏi công khai ngay và chuyển về trạng thái chờ duyệt lại.
        </p>
      )}

      <fieldset className={placeMgmtStyles.section}>
        <legend className={placeMgmtStyles.sectionTitle}>Loại tin</legend>
        <div className={placeMgmtStyles.fieldGrid}>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="re-poster-role">
              Bạn là <span className={placeMgmtStyles.requiredMark}>*</span>
            </label>
            <select
              id="re-poster-role"
              className={uiStyles.select}
              value={input.poster_role}
              onChange={(e) => set('poster_role', e.target.value as UpsertRealEstateListingInput['poster_role'])}
              disabled={submitting}
            >
              {REAL_ESTATE_POSTER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {realEstatePosterRoleLabel(r, 'vi')}
                </option>
              ))}
            </select>
          </div>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="re-transaction-type">
              Giao dịch <span className={placeMgmtStyles.requiredMark}>*</span>
            </label>
            <select
              id="re-transaction-type"
              className={uiStyles.select}
              value={input.transaction_type}
              onChange={(e) => setTransactionType(e.target.value as UpsertRealEstateListingInput['transaction_type'])}
              disabled={submitting}
            >
              {REAL_ESTATE_TRANSACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {realEstateTransactionTypeLabel(t, 'vi')}
                </option>
              ))}
            </select>
          </div>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="re-property-type">
              Loại tài sản <span className={placeMgmtStyles.requiredMark}>*</span>
            </label>
            <select
              id="re-property-type"
              className={uiStyles.select}
              value={input.property_type}
              onChange={(e) => set('property_type', e.target.value as UpsertRealEstateListingInput['property_type'])}
              disabled={submitting}
            >
              {REAL_ESTATE_PROPERTY_TYPES.map((p) => (
                <option key={p} value={p}>
                  {realEstatePropertyTypeLabel(p, 'vi')}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className={placeMgmtStyles.section}>
        <legend className={placeMgmtStyles.sectionTitle}>Thông tin chung</legend>
        <div className={placeMgmtStyles.fieldGrid}>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="re-title">
              Tiêu đề <span className={placeMgmtStyles.requiredMark}>*</span>
            </label>
            <input
              id="re-title"
              className={placeMgmtStyles.input}
              value={input.title}
              onChange={(e) => set('title', e.target.value)}
              required
              maxLength={200}
              disabled={submitting}
            />
          </div>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="re-ward">
              Khu vực (không bắt buộc)
            </label>
            <input
              id="re-ward"
              className={placeMgmtStyles.input}
              value={input.ward ?? ''}
              onChange={(e) => set('ward', e.target.value)}
              maxLength={80}
              disabled={submitting}
            />
          </div>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="re-area">
              Diện tích (m², không bắt buộc)
            </label>
            <input
              id="re-area"
              type="number"
              min={0}
              className={placeMgmtStyles.input}
              value={input.area_sqm ?? ''}
              onChange={(e) => setNumberOrNull('area_sqm', e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className={placeMgmtStyles.section}>
        <legend className={placeMgmtStyles.sectionTitle}>Vị trí</legend>
        <p className={placeMgmtStyles.fieldHint}>
          &quot;Chỉ khu vực&quot; — công khai chỉ hiện tên khu vực, KHÔNG hiện địa chỉ/toạ độ cụ
          thể. &quot;Địa chỉ cụ thể&quot; — công khai hiện đầy đủ. Nếu tải ảnh có gắn vị trí chụp,
          hãy tự kiểm tra trước khi đăng khi chọn &quot;chỉ khu vực&quot; (hệ thống hiện chưa tự
          tước thông tin vị trí khỏi ảnh).
        </p>
        <div className={placeMgmtStyles.fieldGrid}>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="re-address-precision">
              Mức công khai vị trí
            </label>
            <select
              id="re-address-precision"
              className={uiStyles.select}
              value={input.address_precision ?? 'area'}
              onChange={(e) => set('address_precision', e.target.value as UpsertRealEstateListingInput['address_precision'])}
              disabled={submitting}
            >
              {REAL_ESTATE_ADDRESS_PRECISIONS.map((p) => (
                <option key={p} value={p}>
                  {p === 'area' ? 'Chỉ khu vực' : 'Địa chỉ cụ thể'}
                </option>
              ))}
            </select>
          </div>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="re-address-text">
              Địa chỉ cụ thể {input.address_precision === 'exact' ? <span className={placeMgmtStyles.requiredMark}>*</span> : '(không bắt buộc)'}
            </label>
            <input
              id="re-address-text"
              className={placeMgmtStyles.input}
              value={input.address_text ?? ''}
              onChange={(e) => set('address_text', e.target.value)}
              maxLength={300}
              disabled={submitting}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className={placeMgmtStyles.section}>
        <legend className={placeMgmtStyles.sectionTitle}>Giá (không bắt buộc)</legend>
        <p className={placeMgmtStyles.fieldHint}>Có số tiền thì phải chọn loại tiền (không mặc định VND).</p>
        <div className={placeMgmtStyles.fieldGrid}>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="re-price">
              Giá
            </label>
            <input
              id="re-price"
              type="number"
              min={0}
              className={placeMgmtStyles.input}
              value={input.price ?? ''}
              onChange={(e) => setNumberOrNull('price', e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="re-price-currency">
              Loại tiền (vd VND)
            </label>
            <input
              id="re-price-currency"
              className={placeMgmtStyles.input}
              value={input.price_currency ?? ''}
              onChange={(e) => set('price_currency', e.target.value)}
              maxLength={3}
              disabled={submitting}
            />
          </div>
          {isRent ? (
            <div className={uiStyles.field}>
              <label className={uiStyles.fieldLabel} htmlFor="re-rent-period">
                Kỳ tính giá
              </label>
              <select
                id="re-rent-period"
                className={uiStyles.select}
                value={input.rent_period ?? ''}
                onChange={(e) => set('rent_period', (e.target.value || null) as UpsertRealEstateListingInput['rent_period'])}
                disabled={submitting}
              >
                <option value="">Chưa rõ</option>
                {REAL_ESTATE_RENT_PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {REAL_ESTATE_RENT_PERIOD_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className={uiStyles.field}>
              <label className={uiStyles.fieldLabel} htmlFor="re-sale-basis">
                Tính theo
              </label>
              <select
                id="re-sale-basis"
                className={uiStyles.select}
                value={input.sale_price_basis ?? ''}
                onChange={(e) =>
                  set('sale_price_basis', (e.target.value || null) as UpsertRealEstateListingInput['sale_price_basis'])
                }
                disabled={submitting}
              >
                <option value="">Chưa rõ</option>
                {REAL_ESTATE_SALE_PRICE_BASES.map((b) => (
                  <option key={b} value={b}>
                    {REAL_ESTATE_SALE_PRICE_BASIS_LABELS[b]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </fieldset>

      {isRent ? (
        <fieldset className={placeMgmtStyles.section}>
          <legend className={placeMgmtStyles.sectionTitle}>Chi tiết cho thuê (không bắt buộc)</legend>
          <div className={placeMgmtStyles.fieldGrid}>
            <div className={uiStyles.field}>
              <label className={uiStyles.fieldLabel} htmlFor="re-deposit">
                Tiền cọc
              </label>
              <input
                id="re-deposit"
                type="number"
                min={0}
                className={placeMgmtStyles.input}
                value={input.deposit_amount ?? ''}
                onChange={(e) => setNumberOrNull('deposit_amount', e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className={uiStyles.field}>
              <label className={uiStyles.fieldLabel} htmlFor="re-furniture">
                Nội thất
              </label>
              <select
                id="re-furniture"
                className={uiStyles.select}
                value={input.furniture_status ?? ''}
                onChange={(e) =>
                  set('furniture_status', (e.target.value || null) as UpsertRealEstateListingInput['furniture_status'])
                }
                disabled={submitting}
              >
                <option value="">Chưa rõ</option>
                {REAL_ESTATE_FURNITURE_STATUSES.map((f) => (
                  <option key={f} value={f}>
                    {REAL_ESTATE_FURNITURE_STATUS_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>
            <div className={uiStyles.field}>
              <label className={uiStyles.fieldLabel} htmlFor="re-move-in">
                Ngày vào ở
              </label>
              <input
                id="re-move-in"
                type="date"
                className={placeMgmtStyles.input}
                value={input.move_in_date ?? ''}
                onChange={(e) => set('move_in_date', e.target.value || null)}
                disabled={submitting}
              />
            </div>
            <div className={uiStyles.field}>
              <label className={uiStyles.fieldLabel} htmlFor="re-lease-term">
                Thời hạn thuê (tháng)
              </label>
              <input
                id="re-lease-term"
                type="number"
                min={0}
                className={placeMgmtStyles.input}
                value={input.lease_term_months ?? ''}
                onChange={(e) => setNumberOrNull('lease_term_months', e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>
          <div className={uiStyles.field}>
            <span id="re-utilities-label" className={uiStyles.fieldLabel}>
              Điện/nước/phí
            </span>
            <div role="group" aria-labelledby="re-utilities-label">
              <RichDescriptionEditor
                value={input.utilities_note_rich ?? (input.utilities_note ? plainTextToRichDoc(input.utilities_note) : null)}
                onChange={(doc) => set('utilities_note_rich', doc)}
                disabled={submitting}
              />
            </div>
          </div>
        </fieldset>
      ) : (
        <fieldset className={placeMgmtStyles.section}>
          <legend className={placeMgmtStyles.sectionTitle}>Chi tiết mua bán (không bắt buộc)</legend>
          <div className={uiStyles.field}>
            <span id="re-legal-status-label" className={uiStyles.fieldLabel}>
              Tình trạng pháp lý (do bạn tự khai — hệ thống không xác minh/đảm bảo)
            </span>
            <div role="group" aria-labelledby="re-legal-status-label">
              <RichDescriptionEditor
                value={input.legal_status_note_rich ?? (input.legal_status_note ? plainTextToRichDoc(input.legal_status_note) : null)}
                onChange={(doc) => set('legal_status_note_rich', doc)}
                disabled={submitting}
              />
            </div>
          </div>
        </fieldset>
      )}

      <fieldset className={placeMgmtStyles.section}>
        <legend className={placeMgmtStyles.sectionTitle}>Mô tả (không bắt buộc)</legend>
        <RichDescriptionEditor
          value={input.description_rich ?? (input.description ? plainTextToRichDoc(input.description) : null)}
          onChange={(doc) => set('description_rich', doc)}
          disabled={submitting}
        />
        <div className={uiStyles.field} style={{ marginTop: '0.75rem' }}>
          <label className={uiStyles.fieldLabel} htmlFor="re-expires-at">
            Hạn đăng tin (không bắt buộc)
          </label>
          <input
            id="re-expires-at"
            type="date"
            className={placeMgmtStyles.input}
            value={input.expires_at ?? ''}
            onChange={(e) => set('expires_at', e.target.value || null)}
            disabled={submitting}
          />
        </div>
      </fieldset>

      <fieldset className={placeMgmtStyles.section}>
        <legend className={placeMgmtStyles.sectionTitle}>Liên hệ (hiện công khai khi tin được duyệt)</legend>
        <div className={placeMgmtStyles.fieldGrid}>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="re-contact-method">
              Hình thức liên hệ <span className={placeMgmtStyles.requiredMark}>*</span>
            </label>
            <input
              id="re-contact-method"
              className={placeMgmtStyles.input}
              placeholder="Điện thoại / Zalo / Email…"
              value={input.contact_method}
              onChange={(e) => set('contact_method', e.target.value)}
              required
              maxLength={30}
              disabled={submitting}
            />
          </div>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="re-contact-value">
              Số điện thoại / địa chỉ liên hệ <span className={placeMgmtStyles.requiredMark}>*</span>
            </label>
            <input
              id="re-contact-value"
              className={placeMgmtStyles.input}
              value={input.contact_value}
              onChange={(e) => set('contact_value', e.target.value)}
              required
              maxLength={200}
              disabled={submitting}
            />
          </div>
        </div>
      </fieldset>

      <div className={placeMgmtStyles.actions}>
        <button type="submit" className={placeMgmtStyles.submitBtn} disabled={submitting}>
          {submitting ? 'Đang lưu…' : existing ? 'Lưu thay đổi' : 'Lưu nháp'}
        </button>
      </div>
    </form>
  );
}

function formErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) return err.message || 'Không thể lưu ở trạng thái hiện tại — tải lại để xem trạng thái mới nhất.';
    if (err.status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
    if (err.status === 404) return 'Không tìm thấy tin bất động sản.';
    if (err.status < 500) return err.message;
  }
  return 'Không lưu được. Vui lòng thử lại.';
}
