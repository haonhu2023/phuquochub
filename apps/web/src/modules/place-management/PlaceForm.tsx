'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ApiError } from '@/lib/http';
import { listCategories, type Category } from '@/modules/categories/api/categories.api';
import { PHU_QUOC_WARDS } from '@/modules/places/wards';
import uiStyles from '@/components/ui/ui.module.css';
import styles from './place-management.module.css';
import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  formStateToOpeningHours,
  openingHoursToFormState,
  validateOpeningHoursForm,
  type OpeningHoursFormState,
  type Weekday,
} from './openingHours';
import type { ManagedPlace, PlaceFormInput } from './types';

interface Props {
  /** Có mặt = sửa (điền sẵn dữ liệu hiện tại); vắng mặt = tạo mới. */
  initial?: ManagedPlace;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (input: PlaceFormInput) => Promise<void>;
  cancelHref: string;
}

const PRICE_RANGES: Array<{ value: PlaceFormInput['price_range']; label: string }> = [
  { value: null, label: 'Không chọn' },
  { value: 'free', label: 'Miễn phí' },
  { value: 'low', label: 'Bình dân' },
  { value: 'mid', label: 'Tầm trung' },
  { value: 'high', label: 'Cao cấp' },
];

// Form dùng chung Tạo/Sửa địa điểm — CHỈ các trường CreatePlaceDto/UpdatePlaceDto thực sự nhận
// (places/dto/places.dto.ts). Validate "cơ bản" giao cho HTML5 (required/min/max/maxLength) thay
// vì lặp lại logic backend — backend vẫn là nguồn quyết định cuối (lỗi 4xx của nó được hiển thị
// nguyên văn, an toàn cho người dùng theo đúng quy ước decideErrorMessage/ModerationDecisionForm).
export function PlaceForm({ initial, submitLabel, submittingLabel, onSubmit, cancelHref }: Props) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [categoriesError, setCategoriesError] = useState(false);

  const [name, setName] = useState(initial?.name ?? '');
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '');
  const [ward, setWard] = useState(initial?.ward ?? '');
  const [shortDescription, setShortDescription] = useState(initial?.short_description ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [lat, setLat] = useState(initial ? String(initial.location.lat) : '');
  const [lng, setLng] = useState(initial ? String(initial.location.lng) : '');
  const [priceRange, setPriceRange] = useState<PlaceFormInput['price_range']>(initial?.price_range ?? null);
  const [openingHours, setOpeningHours] = useState<OpeningHoursFormState>(() =>
    openingHoursToFormState(initial?.opening_hours),
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    listCategories()
      .then((list) => {
        if (!cancelled) setCategories(list);
      })
      .catch(() => {
        if (!cancelled) setCategoriesError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSuccess(false);

    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      setError('Vĩ độ/kinh độ phải là số hợp lệ.');
      return;
    }

    const openingHoursErrors = validateOpeningHoursForm(openingHours);
    if (openingHoursErrors.length > 0) {
      const first = openingHoursErrors[0];
      setError(
        `Khung giờ mở cửa ${WEEKDAY_LABELS[first.day]} còn thiếu giờ mở hoặc giờ đóng. Vui lòng điền đủ hoặc xoá khung giờ đó.`,
      );
      return;
    }

    const input: PlaceFormInput = {
      name: name.trim(),
      category_id: categoryId,
      location: { lat: latNum, lng: lngNum },
      address: address.trim() || null,
      ward: ward || null,
      description: description.trim() || null,
      short_description: shortDescription.trim() || null,
      price_range: priceRange,
      opening_hours: formStateToOpeningHours(openingHours, initial?.opening_hours ?? null),
    };

    setSubmitting(true);
    try {
      await onSubmit(input);
      setSuccess(true);
    } catch (err) {
      setError(formErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} aria-busy={submitting}>
      {error && (
        <p className={styles.alert} role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className={styles.success} role="status">
          Đã lưu thành công.
        </p>
      )}

      <fieldset className={styles.section}>
        <legend className={styles.sectionTitle}>Thông tin cơ bản</legend>

        <div className={uiStyles.field}>
          <label className={uiStyles.fieldLabel} htmlFor="pf-name">
            Tên địa điểm <span className={styles.requiredMark}>*</span>
          </label>
          <input
            id="pf-name"
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            disabled={submitting}
          />
        </div>

        <div className={styles.fieldGrid}>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="pf-category">
              Danh mục <span className={styles.requiredMark}>*</span>
            </label>
            <select
              id="pf-category"
              className={uiStyles.select}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
              disabled={submitting || !categories}
            >
              <option value="">{categories ? 'Chọn danh mục' : 'Đang tải…'}</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name_vi}
                </option>
              ))}
            </select>
            {categoriesError && <p className={styles.fieldError}>Không tải được danh mục. Tải lại trang để thử lại.</p>}
          </div>

          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="pf-ward">
              Khu vực
            </label>
            <select
              id="pf-ward"
              className={uiStyles.select}
              value={ward}
              onChange={(e) => setWard(e.target.value)}
              disabled={submitting}
            >
              <option value="">Không chọn</option>
              {PHU_QUOC_WARDS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={uiStyles.field}>
          <label className={uiStyles.fieldLabel} htmlFor="pf-short-desc">
            Mô tả ngắn
          </label>
          <input
            id="pf-short-desc"
            className={styles.input}
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            maxLength={300}
            disabled={submitting}
          />
        </div>

        <div className={uiStyles.field}>
          <label className={uiStyles.fieldLabel} htmlFor="pf-desc">
            Mô tả chi tiết
          </label>
          <textarea
            id="pf-desc"
            className={styles.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            disabled={submitting}
          />
        </div>
      </fieldset>

      <fieldset className={styles.section}>
        <legend className={styles.sectionTitle}>Vị trí</legend>

        <div className={uiStyles.field}>
          <label className={uiStyles.fieldLabel} htmlFor="pf-address">
            Địa chỉ
          </label>
          <input
            id="pf-address"
            className={styles.input}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={300}
            disabled={submitting}
          />
        </div>

        <div className={styles.fieldGrid}>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="pf-lat">
              Vĩ độ (lat) <span className={styles.requiredMark}>*</span>
            </label>
            <input
              id="pf-lat"
              className={styles.input}
              type="number"
              step="any"
              min={-90}
              max={90}
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              required
              disabled={submitting}
            />
          </div>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="pf-lng">
              Kinh độ (lng) <span className={styles.requiredMark}>*</span>
            </label>
            <input
              id="pf-lng"
              className={styles.input}
              type="number"
              step="any"
              min={-180}
              max={180}
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              required
              disabled={submitting}
            />
          </div>
        </div>
        <p className={styles.fieldHint}>
          Nhập toạ độ trực tiếp (chưa hỗ trợ chọn trên bản đồ ở phiên bản này).
        </p>
      </fieldset>

      <fieldset className={styles.section}>
        <legend className={styles.sectionTitle}>Giá</legend>
        <div className={uiStyles.field}>
          <label className={uiStyles.fieldLabel} htmlFor="pf-price">
            Mức giá
          </label>
          <select
            id="pf-price"
            className={uiStyles.select}
            value={priceRange ?? ''}
            onChange={(e) => setPriceRange((e.target.value || null) as PlaceFormInput['price_range'])}
            disabled={submitting}
          >
            {PRICE_RANGES.map((p) => (
              <option key={p.label} value={p.value ?? ''}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset className={styles.section}>
        <legend className={styles.sectionTitle}>Giờ mở cửa</legend>

        <div className={styles.checkboxField}>
          <input
            id="pf-oh-24h"
            type="checkbox"
            checked={openingHours.is24h}
            onChange={toggleIs24h}
            disabled={submitting}
          />
          <label htmlFor="pf-oh-24h">Mở cửa 24 giờ mỗi ngày</label>
        </div>

        <div>
          {WEEKDAYS.map((day) => (
            <div key={day} className={styles.dayRow}>
              <span className={styles.dayLabel}>{WEEKDAY_LABELS[day]}</span>
              <div className={styles.dayRanges}>
                {openingHours.regular[day].length === 0 && (
                  <span className={styles.closedLabel}>Đóng cửa</span>
                )}
                {openingHours.regular[day].map((range, index) => (
                  <div key={index} className={styles.rangeRow}>
                    <input
                      type="time"
                      className={styles.timeInput}
                      value={range.open}
                      onChange={(e) => updateRange(day, index, 'open', e.target.value)}
                      aria-label={`Giờ mở cửa ${WEEKDAY_LABELS[day]} khung ${index + 1}`}
                      disabled={submitting}
                    />
                    <span className={styles.rangeSep}>–</span>
                    <input
                      type="time"
                      className={styles.timeInput}
                      value={range.close}
                      onChange={(e) => updateRange(day, index, 'close', e.target.value)}
                      aria-label={`Giờ đóng cửa ${WEEKDAY_LABELS[day]} khung ${index + 1}`}
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      className={styles.removeRangeBtn}
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
                  className={styles.addRangeBtn}
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
        <p className={styles.fieldHint}>
          Có thể qua đêm (vd 22:00–02:00). Nhiều khung/ngày nếu nghỉ trưa. Không thêm khung giờ nào = đóng cửa cả ngày.
        </p>

        <div className={uiStyles.field}>
          <label className={uiStyles.fieldLabel} htmlFor="pf-oh-note">
            Ghi chú giờ mở cửa (không bắt buộc)
          </label>
          <input
            id="pf-oh-note"
            className={styles.input}
            value={openingHours.note}
            onChange={(e) => setOpeningHoursNote(e.target.value)}
            maxLength={300}
            disabled={submitting}
          />
        </div>
      </fieldset>

      <div className={styles.actions}>
        <button type="submit" className={styles.submitBtn} disabled={submitting}>
          {submitting ? submittingLabel : submitLabel}
        </button>
        <Link href={cancelHref} className={styles.cancelLink}>
          Huỷ
        </Link>
      </div>
    </form>
  );
}

function formErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Bạn không có quyền thực hiện thao tác này trên địa điểm này.';
    if (err.status === 404) return 'Không tìm thấy địa điểm — có thể đã bị xoá.';
    if (err.status < 500) return err.message;
    return 'Không lưu được địa điểm. Vui lòng thử lại.';
  }
  return err instanceof Error ? err.message : 'Không lưu được địa điểm. Vui lòng thử lại.';
}
