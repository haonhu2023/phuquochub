'use client';

import { useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/http';
import uiStyles from '@/components/ui/ui.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';
import { CONTACT_TYPE_LABELS, CONTACT_VALUE_INPUT_TYPE } from './contactTypeLabels';
import { CONTACT_TYPES } from './types';
import type { ContactFormInput, ContactTypeValue, PlaceContact } from './types';

interface Props {
  /** Có mặt = sửa (điền sẵn); vắng mặt = thêm mới. */
  initial?: PlaceContact;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (input: ContactFormInput) => Promise<void>;
  onCancel?: () => void;
}

// Form dùng chung Thêm/Sửa liên hệ — CHỈ các trường CreateContactDto/UpdateContactDto thực sự
// nhận (contacts.dto.ts). `contact_type` là danh sách ĐÓNG (backend @IsIn) -> <select>, không phải
// free text. `type` của input `value` đổi theo contact_type đã chọn (tel/email/url/text) — chỉ để
// cải thiện UX nhập liệu, KHÔNG thêm ràng buộc chặt hơn backend (không `pattern`, không giả định
// số điện thoại Việt Nam).
export function ContactEditor({ initial, submitLabel, submittingLabel, onSubmit, onCancel }: Props) {
  const idSuffix = initial?.id ?? 'new';
  const [contactType, setContactType] = useState<ContactTypeValue>(
    (initial?.contact_type as ContactTypeValue) ?? CONTACT_TYPES[0],
  );
  const [value, setValue] = useState(initial?.value ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [isPrimary, setIsPrimary] = useState(initial?.is_primary ?? false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputType = CONTACT_VALUE_INPUT_TYPE[contactType];

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    const trimmedValue = value.trim();
    if (!trimmedValue) {
      setError('Vui lòng nhập nội dung liên hệ.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        contact_type: contactType,
        value: trimmedValue,
        label: label.trim() || null,
        is_primary: isPrimary,
      });
    } catch (err) {
      setError(contactErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={submitting}>
      {error && (
        <p className={placeMgmtStyles.alert} role="alert" style={{ marginBottom: '0.75rem' }}>
          {error}
        </p>
      )}
      <div className={placeMgmtStyles.fieldGrid}>
        <div className={uiStyles.field}>
          <label className={uiStyles.fieldLabel} htmlFor={`contact-type-${idSuffix}`}>
            Loại liên hệ
          </label>
          <select
            id={`contact-type-${idSuffix}`}
            className={uiStyles.select}
            value={contactType}
            onChange={(e) => setContactType(e.target.value as ContactTypeValue)}
            disabled={submitting}
          >
            {CONTACT_TYPES.map((t) => (
              <option key={t} value={t}>
                {CONTACT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div className={uiStyles.field}>
          <label className={uiStyles.fieldLabel} htmlFor={`contact-value-${idSuffix}`}>
            Nội dung <span className={placeMgmtStyles.requiredMark}>*</span>
          </label>
          <input
            id={`contact-value-${idSuffix}`}
            className={placeMgmtStyles.input}
            type={inputType}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={300}
            required
            disabled={submitting}
          />
        </div>

        <div className={uiStyles.field}>
          <label className={uiStyles.fieldLabel} htmlFor={`contact-label-${idSuffix}`}>
            Nhãn (không bắt buộc)
          </label>
          <input
            id={`contact-label-${idSuffix}`}
            className={placeMgmtStyles.input}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={120}
            placeholder="vd: Lễ tân, Đặt bàn…"
            disabled={submitting}
          />
        </div>
      </div>

      <div className={placeMgmtStyles.checkboxField} style={{ marginTop: '0.75rem' }}>
        <input
          id={`contact-primary-${idSuffix}`}
          type="checkbox"
          checked={isPrimary}
          onChange={(e) => setIsPrimary(e.target.checked)}
          disabled={submitting}
        />
        <label htmlFor={`contact-primary-${idSuffix}`}>Đặt làm liên hệ chính cho loại này</label>
      </div>

      <div className={placeMgmtStyles.actions} style={{ marginTop: '0.75rem' }}>
        <button type="submit" className={placeMgmtStyles.submitBtn} disabled={submitting}>
          {submitting ? submittingLabel : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            className={placeMgmtStyles.linkBtn}
            onClick={onCancel}
            disabled={submitting}
          >
            Huỷ
          </button>
        )}
      </div>
    </form>
  );
}

function contactErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Bạn không có quyền chỉnh sửa liên hệ của địa điểm này.';
    if (err.status === 404) return 'Không tìm thấy liên hệ — có thể đã bị xoá.';
    if (err.status < 500) return err.message;
    return 'Không lưu được liên hệ. Vui lòng thử lại.';
  }
  return err instanceof Error ? err.message : 'Không lưu được liên hệ. Vui lòng thử lại.';
}
