'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ApiError } from '@/lib/http';
import legalStyles from '@/modules/legal/legal.module.css';
import { readSession } from '@/modules/auth/session';
import { reportPlace } from './api/place-reports.api';
import { PLACE_REPORT_REASONS, PLACE_REPORT_REASON_LABELS, type PlaceReportReason } from './types';
import uiStyles from '@/components/ui/ui.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';

const DESCRIPTION_MAX_LENGTH = 1000; // CreateReportDto.description @MaxLength(1000)

interface Props {
  placeId: string;
  placeName: string;
  onSubmitted: () => void;
}

// Form "Báo thông tin sai" (POST /places/:id/report) — cùng khuôn ClaimForm.tsx (business claim):
// đọc session cục bộ trước khi gửi (không dựa vào redirect của RouteGuard để phát hiện hết hạn
// phiên giữa lúc điền form), map lỗi ApiError thành câu tiếng Việt cụ thể theo status.
export function ReportPlaceForm({ placeId, placeName, onSubmitted }: Props) {
  const [reason, setReason] = useState<PlaceReportReason>('misinformation');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    const session = readSession();
    if (!session) {
      setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }

    setSubmitting(true);
    try {
      await reportPlace(placeId, { reason, description: description.trim() || undefined }, session.accessToken);
      onSubmitted();
    } catch (err) {
      setError(reportErrorMessage(err));
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
          Vấn đề <span className={placeMgmtStyles.requiredMark}>*</span>
        </legend>
        <div className={uiStyles.field}>
          <label className={uiStyles.fieldLabel} htmlFor="report-reason">
            Loại vấn đề
          </label>
          <select
            id="report-reason"
            className={uiStyles.select}
            value={reason}
            onChange={(e) => setReason(e.target.value as PlaceReportReason)}
            disabled={submitting}
          >
            {PLACE_REPORT_REASONS.map((r) => (
              <option key={r} value={r}>
                {PLACE_REPORT_REASON_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div className={uiStyles.field}>
          <label className={uiStyles.fieldLabel} htmlFor="report-description">
            Mô tả cụ thể (không bắt buộc)
          </label>
          <textarea
            id="report-description"
            className={placeMgmtStyles.input}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={DESCRIPTION_MAX_LENGTH}
            rows={4}
            disabled={submitting}
            placeholder="Ví dụ: giờ mở cửa ghi sai, địa điểm đã đóng cửa, số điện thoại không liên lạc được…"
          />
        </div>
      </fieldset>

      <div className={placeMgmtStyles.actions}>
        <button type="submit" className={placeMgmtStyles.submitBtn} disabled={submitting}>
          {submitting ? 'Đang gửi…' : 'Gửi báo cáo'}
        </button>
      </div>
      <p className={legalStyles.formDisclosure}>
        Báo cáo của bạn được gửi cho kiểm duyệt viên xem xét, không công khai và không được xử lý
        tức thì. Xem <Link href="/terms">Điều khoản</Link> và{' '}
        <Link href="/privacy">Chính sách bảo mật</Link>.
      </p>
    </form>
  );
}

function reportErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404) return 'Không tìm thấy địa điểm này.';
    if (err.status === 409) return 'Bạn đã báo cáo địa điểm này rồi — kiểm duyệt viên sẽ xem xét.';
    if (err.status === 429) return 'Bạn gửi báo cáo quá nhanh. Vui lòng thử lại sau ít phút.';
    if (err.status < 500) return err.message;
  }
  return err instanceof Error ? err.message : 'Không gửi được báo cáo. Vui lòng thử lại.';
}
