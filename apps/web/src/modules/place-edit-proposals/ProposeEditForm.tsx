'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ApiError } from '@/lib/http';
import legalStyles from '@/modules/legal/legal.module.css';
import { readSession } from '@/modules/auth/session';
import uiStyles from '@/components/ui/ui.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';
import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  formStateToOpeningHours,
  openingHoursToFormState,
  validateOpeningHoursForm,
  type OpeningHoursFormState,
  type Weekday,
} from '@/modules/place-management/openingHours';
import type { PlaceDetail } from '@/modules/places/types';
import { submitPlaceEditProposal } from './api/place-edit-proposals.api';
import {
  PLACE_EDIT_PROPOSAL_FIELD_KEYS,
  PLACE_EDIT_PROPOSAL_FIELD_LABELS,
  type PlaceEditProposalFieldKey,
} from './types';

const REASON_MAX_LENGTH = 1000; // CreatePlaceEditProposalDto.reason @MaxLength(1000)

interface Props {
  placeId: string;
  placeName: string;
  /** Dữ liệu hiện tại của place (nếu lấy được qua place_slug) — dùng để hiện giá trị so sánh và
   * điền sẵn giá trị đề xuất. Null khi CTA không mang theo slug hoặc lấy dữ liệu thất bại — vẫn
   * cho gửi đề xuất bình thường, chỉ là không hiện được phần so sánh. */
  currentPlace: PlaceDetail | null;
  onSubmitted: () => void;
}

function hoursForDay(ranges: { open: string; close: string }[]): string {
  if (ranges.length === 0) return 'Đóng cửa';
  return ranges.map((r) => `${r.open}–${r.close}`).join(', ');
}

// Form "Đề xuất chỉnh sửa" (POST /places/:id/edit-proposals) — cùng khuôn ReportPlaceForm.tsx,
// khác ở chỗ PHẢI thu thập một giá trị đề xuất cụ thể theo field_key (không chỉ lý do). Đọc session
// cục bộ trước khi gửi (không dựa vào redirect của RouteGuard để phát hiện hết hạn phiên giữa lúc
// điền form), map lỗi ApiError thành câu tiếng Việt cụ thể theo status.
export function ProposeEditForm({ placeId, placeName, currentPlace, onSubmitted }: Props) {
  const [fieldKey, setFieldKey] = useState<PlaceEditProposalFieldKey>('address');
  const [address, setAddress] = useState(currentPlace?.address ?? '');
  const [shortDescription, setShortDescription] = useState(currentPlace?.short_description ?? '');
  const [openingHours, setOpeningHours] = useState<OpeningHoursFormState>(() =>
    openingHoursToFormState(currentPlace?.opening_hours),
  );
  const [reason, setReason] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleIs24h() {
    setOpeningHours((prev) => ({ ...prev, is24h: !prev.is24h }));
  }

  function setOpeningHoursNote(value: string) {
    setOpeningHours((prev) => ({ ...prev, note: value }));
  }

  function addRange(day: Weekday) {
    setOpeningHours((prev) => ({
      ...prev,
      regular: { ...prev.regular, [day]: [...prev.regular[day], { open: '', close: '' }] },
    }));
  }

  function removeRange(day: Weekday, index: number) {
    setOpeningHours((prev) => ({
      ...prev,
      regular: { ...prev.regular, [day]: prev.regular[day].filter((_, i) => i !== index) },
    }));
  }

  function updateRange(day: Weekday, index: number, field: 'open' | 'close', value: string) {
    setOpeningHours((prev) => ({
      ...prev,
      regular: {
        ...prev.regular,
        [day]: prev.regular[day].map((r, i) => (i === index ? { ...r, [field]: value } : r)),
      },
    }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError('Vui lòng cho biết lý do đề xuất.');
      return;
    }

    let proposedValue: unknown;
    if (fieldKey === 'address') {
      if (!address.trim()) {
        setError('Địa chỉ đề xuất không được để trống.');
        return;
      }
      proposedValue = address.trim();
    } else if (fieldKey === 'short_description') {
      if (!shortDescription.trim()) {
        setError('Mô tả ngắn đề xuất không được để trống.');
        return;
      }
      proposedValue = shortDescription.trim();
    } else {
      const rangeErrors = validateOpeningHoursForm(openingHours);
      if (rangeErrors.length > 0) {
        setError('Còn khung giờ thiếu giờ mở hoặc giờ đóng — vui lòng điền đủ hoặc xoá khung đó.');
        return;
      }
      proposedValue = formStateToOpeningHours(openingHours, currentPlace?.opening_hours ?? null);
    }

    const session = readSession();
    if (!session) {
      setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    setSubmitting(true);
    try {
      await submitPlaceEditProposal(
        placeId,
        {
          field_key: fieldKey,
          proposed_value: proposedValue,
          reason: trimmedReason,
          ...(sourceUrl.trim() ? { source_url: sourceUrl.trim() } : {}),
        } as never,
        session.accessToken,
      );
      onSubmitted();
    } catch (err) {
      setError(submitErrorMessage(err));
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
          Thông tin muốn sửa <span className={placeMgmtStyles.requiredMark}>*</span>
        </legend>
        <div className={uiStyles.field}>
          <label className={uiStyles.fieldLabel} htmlFor="pep-field-key">
            Trường dữ liệu
          </label>
          <select
            id="pep-field-key"
            className={uiStyles.select}
            value={fieldKey}
            onChange={(e) => setFieldKey(e.target.value as PlaceEditProposalFieldKey)}
            disabled={submitting}
          >
            {PLACE_EDIT_PROPOSAL_FIELD_KEYS.map((k) => (
              <option key={k} value={k}>
                {PLACE_EDIT_PROPOSAL_FIELD_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      {fieldKey === 'address' && (
        <fieldset className={placeMgmtStyles.section}>
          <legend className={placeMgmtStyles.sectionTitle}>Địa chỉ</legend>
          {currentPlace && (
            <p className={placeMgmtStyles.fieldHint}>
              Hiện tại: {currentPlace.address || 'Chưa có thông tin'}
            </p>
          )}
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="pep-address">
              Địa chỉ đề xuất
            </label>
            <input
              id="pep-address"
              className={placeMgmtStyles.input}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={300}
              disabled={submitting}
            />
          </div>
        </fieldset>
      )}

      {fieldKey === 'short_description' && (
        <fieldset className={placeMgmtStyles.section}>
          <legend className={placeMgmtStyles.sectionTitle}>Mô tả ngắn</legend>
          {currentPlace && (
            <p className={placeMgmtStyles.fieldHint}>
              Hiện tại: {currentPlace.short_description || 'Chưa có thông tin'}
            </p>
          )}
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="pep-short-description">
              Mô tả ngắn đề xuất
            </label>
            <textarea
              id="pep-short-description"
              className={placeMgmtStyles.textarea}
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              maxLength={300}
              rows={3}
              disabled={submitting}
            />
          </div>
        </fieldset>
      )}

      {fieldKey === 'opening_hours' && (
        <fieldset className={placeMgmtStyles.section}>
          <legend className={placeMgmtStyles.sectionTitle}>Giờ mở cửa</legend>

          {currentPlace && (
            <details className={placeMgmtStyles.fieldHint} open={false}>
              <summary>Xem giờ mở cửa hiện tại</summary>
              <ul>
                {WEEKDAYS.map((day) => (
                  <li key={day}>
                    {WEEKDAY_LABELS[day]}:{' '}
                    {currentPlace.opening_hours?.is_24h
                      ? 'Mở cửa 24 giờ'
                      : hoursForDay(currentPlace.opening_hours?.regular?.[day] ?? [])}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className={placeMgmtStyles.checkboxField}>
            <input
              id="pep-oh-24h"
              type="checkbox"
              checked={openingHours.is24h}
              onChange={toggleIs24h}
              disabled={submitting}
            />
            <label htmlFor="pep-oh-24h">Mở cửa 24 giờ mỗi ngày</label>
          </div>

          <div>
            {WEEKDAYS.map((day) => (
              <div key={day} className={placeMgmtStyles.dayRow}>
                <span className={placeMgmtStyles.dayLabel}>{WEEKDAY_LABELS[day]}</span>
                <div className={placeMgmtStyles.dayRanges}>
                  {openingHours.regular[day].length === 0 && (
                    <span className={placeMgmtStyles.closedLabel}>Đóng cửa</span>
                  )}
                  {openingHours.regular[day].map((range, index) => (
                    <div key={index} className={placeMgmtStyles.rangeRow}>
                      <input
                        type="time"
                        className={placeMgmtStyles.timeInput}
                        value={range.open}
                        onChange={(e) => updateRange(day, index, 'open', e.target.value)}
                        aria-label={`Giờ mở cửa ${WEEKDAY_LABELS[day]} khung ${index + 1}`}
                        disabled={submitting}
                      />
                      <span className={placeMgmtStyles.rangeSep}>–</span>
                      <input
                        type="time"
                        className={placeMgmtStyles.timeInput}
                        value={range.close}
                        onChange={(e) => updateRange(day, index, 'close', e.target.value)}
                        aria-label={`Giờ đóng cửa ${WEEKDAY_LABELS[day]} khung ${index + 1}`}
                        disabled={submitting}
                      />
                      <button
                        type="button"
                        className={placeMgmtStyles.removeRangeBtn}
                        onClick={() => removeRange(day, index)}
                        aria-label={`Xoá khung giờ ${index + 1} của ${WEEKDAY_LABELS[day]}`}
                        disabled={submitting}
                      >
                        Xoá
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className={placeMgmtStyles.addRangeBtn}
                    onClick={() => addRange(day)}
                    aria-label={`Thêm khung giờ cho ${WEEKDAY_LABELS[day]}`}
                    disabled={submitting}
                  >
                    + Thêm khung giờ
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className={placeMgmtStyles.fieldHint}>
            Có thể qua đêm (vd 22:00–02:00). Không thêm khung giờ nào = đóng cửa cả ngày.
          </p>

          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="pep-oh-note">
              Ghi chú giờ mở cửa (không bắt buộc)
            </label>
            <input
              id="pep-oh-note"
              className={placeMgmtStyles.input}
              value={openingHours.note}
              onChange={(e) => setOpeningHoursNote(e.target.value)}
              maxLength={300}
              disabled={submitting}
            />
          </div>
        </fieldset>
      )}

      <fieldset className={placeMgmtStyles.section}>
        <legend className={placeMgmtStyles.sectionTitle}>
          Lý do đề xuất <span className={placeMgmtStyles.requiredMark}>*</span>
        </legend>
        <div className={uiStyles.field}>
          <label className={uiStyles.fieldLabel} htmlFor="pep-reason">
            Vì sao bạn nghĩ nên sửa
          </label>
          <textarea
            id="pep-reason"
            className={placeMgmtStyles.textarea}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={REASON_MAX_LENGTH}
            rows={3}
            disabled={submitting}
            placeholder="Ví dụ: mới ghé quán tuần trước, giờ mở cửa đã đổi…"
          />
        </div>
        <div className={uiStyles.field}>
          <label className={uiStyles.fieldLabel} htmlFor="pep-source-url">
            Link nguồn tham khảo (không bắt buộc)
          </label>
          <input
            id="pep-source-url"
            type="url"
            className={placeMgmtStyles.input}
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            maxLength={500}
            placeholder="https://…"
            disabled={submitting}
          />
        </div>
      </fieldset>

      <div className={placeMgmtStyles.actions}>
        <button type="submit" className={placeMgmtStyles.submitBtn} disabled={submitting}>
          {submitting ? 'Đang gửi…' : 'Gửi đề xuất'}
        </button>
      </div>
      <p className={legalStyles.formDisclosure}>
        Đề xuất của bạn được gửi cho kiểm duyệt viên xem xét, không áp dụng ngay và không công khai
        cho tới khi được duyệt. Xem <Link href="/terms">Điều khoản</Link> và{' '}
        <Link href="/privacy">Chính sách bảo mật</Link>.
      </p>
    </form>
  );
}

function submitErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404) return 'Không tìm thấy địa điểm này.';
    if (err.status === 409)
      return 'Bạn đã có một đề xuất đang chờ xử lý cho đúng trường này ở địa điểm này.';
    if (err.status === 429) return 'Bạn gửi đề xuất quá nhanh. Vui lòng thử lại sau ít phút.';
    if (err.status < 500) return err.message;
  }
  return err instanceof Error ? err.message : 'Không gửi được đề xuất. Vui lòng thử lại.';
}
