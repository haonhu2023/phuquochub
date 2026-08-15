'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ApiError } from '@/lib/http';
import legalStyles from '@/modules/legal/legal.module.css';
import { readSession } from '@/modules/auth/session';
import { submitBusinessClaim } from './api/business-claims.api';
import {
  BUSINESS_CLAIM_EVIDENCE_TYPES,
  EVIDENCE_REFERENCE_HINTS,
  EVIDENCE_TYPE_LABELS,
  type BusinessClaimEvidenceInput,
  type BusinessClaimSummary,
} from './types';
import uiStyles from '@/components/ui/ui.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';
import styles from './business-claims.module.css';

const MAX_EVIDENCE_ITEMS = 10; // ArrayMaxSize(10), business.dto.ts
const REFERENCE_MAX_LENGTH = 500;
const NOTE_MAX_LENGTH = 300;

interface Props {
  placeId: string;
  placeName: string;
  onSubmitted: (summary: BusinessClaimSummary) => void;
}

function emptyItem(): BusinessClaimEvidenceInput {
  return { type: 'storefront_photo', reference: '', note: '' };
}

// Form gửi Business Claim (PLACE-042) — CHỈ các trường SubmitBusinessClaimDto thực sự nhận
// (place_id + evidence[]). Danh sách bằng chứng là mảng ĐỘNG (1-10 mục, ArrayMinSize/ArrayMaxSize
// ở business.dto.ts) — form khởi tạo với đúng 1 mục bắt buộc, cho phép thêm/bớt.
export function ClaimForm({ placeId, placeName, onSubmitted }: Props) {
  const [items, setItems] = useState<BusinessClaimEvidenceInput[]>([emptyItem()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateItem(index: number, patch: Partial<BusinessClaimEvidenceInput>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function addItem() {
    if (items.length >= MAX_EVIDENCE_ITEMS) return;
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
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

    const evidence = items.map((it) => ({
      type: it.type,
      reference: it.reference.trim(),
      note: it.note?.trim() || undefined,
    }));
    // HTML `required` chỉ chặn chuỗi rỗng, KHÔNG chặn chuỗi toàn khoảng trắng — backend cũng
    // không có @IsNotEmpty() trên `reference` (chỉ @IsString()), nên tự kiểm ở đây thay vì gửi
    // lên một bằng chứng trống mà cả hai tầng đều "chấp nhận" một cách vô nghĩa.
    if (evidence.some((it) => it.reference === '')) {
      setError('Vui lòng nhập nội dung cho mỗi bằng chứng (không được để trống).');
      return;
    }

    setSubmitting(true);
    try {
      const summary = await submitBusinessClaim({ place_id: placeId, evidence }, session.accessToken);
      onSubmitted(summary);
    } catch (err) {
      setError(claimErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={placeMgmtStyles.form} onSubmit={handleSubmit} aria-busy={submitting}>
      {error && (
        <p className={placeMgmtStyles.alert} role="alert">
          {error}
        </p>
      )}

      <fieldset className={placeMgmtStyles.section}>
        <legend className={placeMgmtStyles.sectionTitle}>Địa điểm</legend>
        <p style={{ margin: 0, color: 'var(--fg)' }}>{placeName}</p>
      </fieldset>

      <fieldset className={placeMgmtStyles.section}>
        <legend className={placeMgmtStyles.sectionTitle}>
          Bằng chứng <span className={placeMgmtStyles.requiredMark}>*</span>
        </legend>
        <p className={placeMgmtStyles.fieldHint}>
          Cung cấp ít nhất một bằng chứng cho thấy bạn quản lý địa điểm này. Kiểm duyệt viên sẽ xem
          xét trước khi phê duyệt.
        </p>

        {items.map((item, index) => (
          <div key={index} className={styles.evidenceItem}>
            <div className={styles.evidenceItemHead}>
              <span className={styles.evidenceItemTitle}>Bằng chứng {index + 1}</span>
              {items.length > 1 && (
                <button type="button" className={styles.removeBtn} onClick={() => removeItem(index)} disabled={submitting}>
                  Xoá
                </button>
              )}
            </div>

            <div className={placeMgmtStyles.fieldGrid}>
              <div className={uiStyles.field}>
                <label className={uiStyles.fieldLabel} htmlFor={`ev-type-${index}`}>
                  Loại bằng chứng
                </label>
                <select
                  id={`ev-type-${index}`}
                  className={uiStyles.select}
                  value={item.type}
                  onChange={(e) => updateItem(index, { type: e.target.value as BusinessClaimEvidenceInput['type'] })}
                  disabled={submitting}
                >
                  {BUSINESS_CLAIM_EVIDENCE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {EVIDENCE_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className={uiStyles.field}>
                <label className={uiStyles.fieldLabel} htmlFor={`ev-reference-${index}`}>
                  Nội dung <span className={placeMgmtStyles.requiredMark}>*</span>
                </label>
                <input
                  id={`ev-reference-${index}`}
                  className={placeMgmtStyles.input}
                  value={item.reference}
                  onChange={(e) => updateItem(index, { reference: e.target.value })}
                  required
                  maxLength={REFERENCE_MAX_LENGTH}
                  disabled={submitting}
                />
                <p className={placeMgmtStyles.fieldHint}>{EVIDENCE_REFERENCE_HINTS[item.type]}</p>
              </div>
            </div>

            <div className={uiStyles.field}>
              <label className={uiStyles.fieldLabel} htmlFor={`ev-note-${index}`}>
                Ghi chú (không bắt buộc)
              </label>
              <input
                id={`ev-note-${index}`}
                className={placeMgmtStyles.input}
                value={item.note ?? ''}
                onChange={(e) => updateItem(index, { note: e.target.value })}
                maxLength={NOTE_MAX_LENGTH}
                disabled={submitting}
              />
            </div>
          </div>
        ))}

        <button
          type="button"
          className={styles.addBtn}
          onClick={addItem}
          disabled={submitting || items.length >= MAX_EVIDENCE_ITEMS}
        >
          + Thêm bằng chứng khác
        </button>
      </fieldset>

      <div className={placeMgmtStyles.actions}>
        <button type="submit" className={placeMgmtStyles.submitBtn} disabled={submitting}>
          {submitting ? 'Đang gửi…' : 'Gửi yêu cầu xác nhận'}
        </button>
      </div>
      <p className={legalStyles.formDisclosure}>
        Bằng chứng bạn gửi được người kiểm duyệt xem để xác minh quyền quản lý. Chỉ gửi yêu cầu nếu
        bạn là chủ sở hữu hoặc người được uỷ quyền — xem{' '}
        <Link href="/terms">Điều khoản</Link> và{' '}
        <Link href="/privacy">Chính sách bảo mật</Link>.
      </p>
    </form>
  );
}

function claimErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404) {
      return 'Không tìm thấy địa điểm, hoặc địa điểm chưa được công khai — chỉ có thể xác nhận quyền quản lý cho địa điểm đã được duyệt.';
    }
    if (err.status === 409) return err.message || 'Bạn đã có một yêu cầu xác nhận đang chờ xử lý cho địa điểm này.';
    if (err.status === 403) return 'Bạn không có quyền gửi yêu cầu này.';
    if (err.status < 500) return err.message;
  }
  return err instanceof Error ? err.message : 'Không gửi được yêu cầu. Vui lòng thử lại.';
}
