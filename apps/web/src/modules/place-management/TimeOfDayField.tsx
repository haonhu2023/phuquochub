'use client';

import { useState, type FocusEvent } from 'react';
import styles from './place-management.module.css';
import { isValidTimeOfDay, normalizeTimeOfDay } from './openingHours';

interface TimeOfDayFieldProps {
  id: string;
  value: string;
  onChange: (raw: string) => void;
  ariaLabel: string;
  disabled?: boolean;
}

/**
 * Ô nhập giờ HH:mm (24 giờ), gõ trực tiếp bằng bàn phím — thay `<input type="time">` (owner báo
 * lỗi thật 16/10/2026: trình duyệt hiện đồng hồ 12 giờ AM/PM, không chọn rõ được 18:00). Dùng
 * chung cho PlaceForm.tsx (editor quản trị) và ProposeEditForm.tsx (đề xuất công khai) — sửa một
 * nơi, cả hai nơi cùng hưởng.
 *
 * Không tự định dạng trong lúc gõ (mỗi phím chỉ cập nhật đúng chuỗi người dùng gõ, không chèn/xoá
 * ký tự nào khác) — tránh nhảy con trỏ hoặc mất nội dung. Chuẩn hoá (thêm số 0, vd "6:00"→"06:00")
 * CHỈ xảy ra lúc rời ô (blur) và chỉ khi giá trị hợp lệ. Giá trị sai định dạng lúc blur: giữ
 * nguyên nội dung đã gõ, hiện lỗi ngay dưới ô — không xoá, không tự đoán ý người dùng.
 */
export function TimeOfDayField({ id, value, onChange, ariaLabel, disabled }: TimeOfDayFieldProps) {
  const [blurredOnce, setBlurredOnce] = useState(false);
  const showError = blurredOnce && value.trim() !== '' && !isValidTimeOfDay(value);
  const errorId = `${id}-error`;

  function handleBlur(e: FocusEvent<HTMLInputElement>) {
    setBlurredOnce(true);
    const normalized = normalizeTimeOfDay(e.target.value);
    if (normalized !== null && normalized !== e.target.value) {
      onChange(normalized);
    }
  }

  return (
    <span className={styles.timeFieldWrap}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className={showError ? `${styles.timeInput} ${styles.timeInputInvalid}` : styles.timeInput}
        value={value}
        onChange={(e) => {
          setBlurredOnce(false);
          onChange(e.target.value);
        }}
        onBlur={handleBlur}
        placeholder="HH:mm"
        aria-label={ariaLabel}
        aria-invalid={showError || undefined}
        aria-describedby={showError ? errorId : undefined}
        disabled={disabled}
      />
      {showError && (
        <span id={errorId} className={styles.fieldError} role="alert">
          Giờ không hợp lệ — nhập dạng HH:mm, 24 giờ (vd 06:00, 18:00).
        </span>
      )}
    </span>
  );
}
