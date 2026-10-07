'use client';

import { useState, type FormEvent } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { createJobListing, updateJobListing } from './api/job-listings.api';
import {
  JOB_LISTING_EMPLOYMENT_TYPES,
  JOB_LISTING_SALARY_PERIODS,
  JOB_LISTING_SALARY_PERIOD_LABELS,
  jobListingEmploymentTypeLabel,
  type JobListingSenderView,
  type UpsertJobListingInput,
} from './types';
import uiStyles from '@/components/ui/ui.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';

interface Props {
  /** Có sẵn → sửa (PATCH); không có → tạo mới (POST). */
  existing?: JobListingSenderView;
  onSaved: (saved: JobListingSenderView) => void;
}

function toInput(v?: JobListingSenderView): UpsertJobListingInput {
  if (!v) {
    return {
      employer_name: '',
      title: '',
      job_category: '',
      work_location: '',
      employment_type: 'full_time',
      contact_method: '',
      contact_value: '',
    };
  }
  return {
    employer_name: v.employer_name,
    employer_role: v.employer_role,
    place_id: v.place_id,
    title: v.title,
    job_category: v.job_category,
    ward: v.ward,
    work_location: v.work_location,
    employment_type: v.employment_type,
    salary_min: v.salary_min,
    salary_max: v.salary_max,
    salary_negotiable: v.salary_negotiable,
    salary_currency: v.salary_currency,
    salary_period: v.salary_period,
    shift_info: v.shift_info,
    requirements: v.requirements,
    benefits: v.benefits,
    description: v.description,
    contact_method: v.contact_method,
    contact_value: v.contact_value,
    expires_at: v.expires_at,
  };
}

// Form tạo/sửa tin tuyển dụng — CHỈ các trường UpsertJobListingDto thực nhận. Sửa khi tin đang
// `published` tự đẩy về `pending` phía service (xem job-listings.service.ts's comment) — form này
// không tự diễn giải chuyển trạng thái, chỉ hiện thông báo chung sau khi lưu thành công.
export function JobListingForm({ existing, onSaved }: Props) {
  const [input, setInput] = useState<UpsertJobListingInput>(toInput(existing));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof UpsertJobListingInput>(key: K, value: UpsertJobListingInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  function setNumberOrNull(key: 'salary_min' | 'salary_max', raw: string) {
    set(key, raw.trim() === '' ? null : Number(raw));
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

    const payload: UpsertJobListingInput = {
      ...input,
      employer_name: input.employer_name.trim(),
      employer_role: input.employer_role?.trim() || null,
      title: input.title.trim(),
      job_category: input.job_category.trim(),
      ward: input.ward?.trim() || null,
      work_location: input.work_location.trim(),
      salary_currency: input.salary_currency?.trim().toUpperCase() || null,
      shift_info: input.shift_info?.trim() || null,
      requirements: input.requirements?.trim() || null,
      benefits: input.benefits?.trim() || null,
      description: input.description?.trim() || null,
      contact_method: input.contact_method.trim(),
      contact_value: input.contact_value.trim(),
      expires_at: input.expires_at?.trim() || null,
    };

    setSubmitting(true);
    try {
      const saved = existing
        ? await updateJobListing(existing.id, payload, session.accessToken)
        : await createJobListing(payload, session.accessToken);
      onSaved(saved);
    } catch (err) {
      setError(formErrorMessage(err));
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

      {existing && existing.status === 'published' && (
        <p className={placeMgmtStyles.fieldHint}>
          Tin đang đăng — lưu thay đổi sẽ ẩn tin khỏi công khai ngay và chuyển về trạng thái chờ duyệt lại.
        </p>
      )}

      <fieldset className={placeMgmtStyles.section}>
        <legend className={placeMgmtStyles.sectionTitle}>Nhà tuyển dụng</legend>
        <div className={placeMgmtStyles.fieldGrid}>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="jl-employer-name">
              Tên cơ sở/nhà tuyển dụng <span className={placeMgmtStyles.requiredMark}>*</span>
            </label>
            <input
              id="jl-employer-name"
              className={placeMgmtStyles.input}
              value={input.employer_name}
              onChange={(e) => set('employer_name', e.target.value)}
              required
              maxLength={200}
              disabled={submitting}
            />
          </div>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="jl-employer-role">
              Vai trò người đăng (không bắt buộc)
            </label>
            <input
              id="jl-employer-role"
              className={placeMgmtStyles.input}
              value={input.employer_role ?? ''}
              onChange={(e) => set('employer_role', e.target.value)}
              maxLength={100}
              disabled={submitting}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className={placeMgmtStyles.section}>
        <legend className={placeMgmtStyles.sectionTitle}>Công việc</legend>
        <div className={placeMgmtStyles.fieldGrid}>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="jl-title">
              Vị trí tuyển <span className={placeMgmtStyles.requiredMark}>*</span>
            </label>
            <input
              id="jl-title"
              className={placeMgmtStyles.input}
              value={input.title}
              onChange={(e) => set('title', e.target.value)}
              required
              maxLength={200}
              disabled={submitting}
            />
          </div>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="jl-category">
              Ngành nghề <span className={placeMgmtStyles.requiredMark}>*</span>
            </label>
            <input
              id="jl-category"
              className={placeMgmtStyles.input}
              value={input.job_category}
              onChange={(e) => set('job_category', e.target.value)}
              required
              maxLength={80}
              disabled={submitting}
            />
          </div>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="jl-ward">
              Khu vực (không bắt buộc)
            </label>
            <input
              id="jl-ward"
              className={placeMgmtStyles.input}
              value={input.ward ?? ''}
              onChange={(e) => set('ward', e.target.value)}
              maxLength={80}
              disabled={submitting}
            />
          </div>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="jl-work-location">
              Nơi làm việc <span className={placeMgmtStyles.requiredMark}>*</span>
            </label>
            <input
              id="jl-work-location"
              className={placeMgmtStyles.input}
              value={input.work_location}
              onChange={(e) => set('work_location', e.target.value)}
              required
              maxLength={300}
              disabled={submitting}
            />
          </div>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="jl-employment-type">
              Hình thức làm việc <span className={placeMgmtStyles.requiredMark}>*</span>
            </label>
            <select
              id="jl-employment-type"
              className={uiStyles.select}
              value={input.employment_type}
              onChange={(e) => set('employment_type', e.target.value as UpsertJobListingInput['employment_type'])}
              disabled={submitting}
            >
              {JOB_LISTING_EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {jobListingEmploymentTypeLabel(t, 'vi')}
                </option>
              ))}
            </select>
          </div>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="jl-shift-info">
              Ca làm việc (không bắt buộc)
            </label>
            <input
              id="jl-shift-info"
              className={placeMgmtStyles.input}
              value={input.shift_info ?? ''}
              onChange={(e) => set('shift_info', e.target.value)}
              maxLength={500}
              disabled={submitting}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className={placeMgmtStyles.section}>
        <legend className={placeMgmtStyles.sectionTitle}>Mức lương (không bắt buộc)</legend>
        <p className={placeMgmtStyles.fieldHint}>
          Để trống nếu chưa muốn công bố số cụ thể — chọn &quot;Thoả thuận&quot; thay vì nhập 0.
          Có số tiền thì phải chọn loại tiền (không mặc định VND).
        </p>
        <div className={placeMgmtStyles.fieldGrid}>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="jl-salary-min">
              Từ
            </label>
            <input
              id="jl-salary-min"
              type="number"
              min={0}
              className={placeMgmtStyles.input}
              value={input.salary_min ?? ''}
              onChange={(e) => setNumberOrNull('salary_min', e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="jl-salary-max">
              Đến
            </label>
            <input
              id="jl-salary-max"
              type="number"
              min={0}
              className={placeMgmtStyles.input}
              value={input.salary_max ?? ''}
              onChange={(e) => setNumberOrNull('salary_max', e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="jl-salary-currency">
              Loại tiền (vd VND, USD)
            </label>
            <input
              id="jl-salary-currency"
              className={placeMgmtStyles.input}
              value={input.salary_currency ?? ''}
              onChange={(e) => set('salary_currency', e.target.value)}
              maxLength={3}
              disabled={submitting}
            />
          </div>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="jl-salary-period">
              Kỳ tính lương
            </label>
            <select
              id="jl-salary-period"
              className={uiStyles.select}
              value={input.salary_period ?? ''}
              onChange={(e) =>
                set('salary_period', (e.target.value || null) as UpsertJobListingInput['salary_period'])
              }
              disabled={submitting}
            >
              <option value="">Chưa rõ</option>
              {JOB_LISTING_SALARY_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {JOB_LISTING_SALARY_PERIOD_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <div className={uiStyles.field} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              id="jl-salary-negotiable"
              type="checkbox"
              checked={input.salary_negotiable ?? false}
              onChange={(e) => set('salary_negotiable', e.target.checked)}
              disabled={submitting}
            />
            <label htmlFor="jl-salary-negotiable">Thoả thuận</label>
          </div>
        </div>
      </fieldset>

      <fieldset className={placeMgmtStyles.section}>
        <legend className={placeMgmtStyles.sectionTitle}>Chi tiết (không bắt buộc)</legend>
        <div className={uiStyles.field}>
          <label className={uiStyles.fieldLabel} htmlFor="jl-description">
            Mô tả công việc
          </label>
          <textarea
            id="jl-description"
            className={placeMgmtStyles.textarea}
            rows={4}
            maxLength={4000}
            value={input.description ?? ''}
            onChange={(e) => set('description', e.target.value)}
            disabled={submitting}
          />
        </div>
        <div className={uiStyles.field}>
          <label className={uiStyles.fieldLabel} htmlFor="jl-requirements">
            Yêu cầu
          </label>
          <textarea
            id="jl-requirements"
            className={placeMgmtStyles.textarea}
            rows={3}
            maxLength={2000}
            value={input.requirements ?? ''}
            onChange={(e) => set('requirements', e.target.value)}
            disabled={submitting}
          />
        </div>
        <div className={uiStyles.field}>
          <label className={uiStyles.fieldLabel} htmlFor="jl-benefits">
            Quyền lợi
          </label>
          <textarea
            id="jl-benefits"
            className={placeMgmtStyles.textarea}
            rows={3}
            maxLength={2000}
            value={input.benefits ?? ''}
            onChange={(e) => set('benefits', e.target.value)}
            disabled={submitting}
          />
        </div>
        <div className={uiStyles.field}>
          <label className={uiStyles.fieldLabel} htmlFor="jl-expires-at">
            Hạn tuyển (không bắt buộc)
          </label>
          <input
            id="jl-expires-at"
            type="date"
            className={placeMgmtStyles.input}
            value={input.expires_at ?? ''}
            onChange={(e) => set('expires_at', e.target.value)}
            disabled={submitting}
          />
        </div>
      </fieldset>

      <fieldset className={placeMgmtStyles.section}>
        <legend className={placeMgmtStyles.sectionTitle}>Liên hệ (hiện công khai khi tin được duyệt)</legend>
        <div className={placeMgmtStyles.fieldGrid}>
          <div className={uiStyles.field}>
            <label className={uiStyles.fieldLabel} htmlFor="jl-contact-method">
              Hình thức liên hệ <span className={placeMgmtStyles.requiredMark}>*</span>
            </label>
            <input
              id="jl-contact-method"
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
            <label className={uiStyles.fieldLabel} htmlFor="jl-contact-value">
              Số điện thoại / địa chỉ liên hệ <span className={placeMgmtStyles.requiredMark}>*</span>
            </label>
            <input
              id="jl-contact-value"
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
    if (err.status === 404) return 'Không tìm thấy tin tuyển dụng.';
    if (err.status < 500) return err.message;
  }
  return 'Không lưu được. Vui lòng thử lại.';
}
