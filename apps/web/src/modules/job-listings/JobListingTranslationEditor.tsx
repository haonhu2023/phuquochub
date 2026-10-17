'use client';

import { useEffect, useState } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { getMyJobListingTranslation, saveJobListingTranslation, submitJobListingTranslation } from './api/job-listings.api';
import { JOB_LISTING_TRANSLATION_STATUS_LABELS, type JobListingSenderDetailView, type JobListingTranslationView } from './types';
import { JobListingTranslationCompare } from './JobListingTranslationCompare';
import uiStyles from '@/components/ui/ui.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';

interface Props {
  /** Bản tiếng Việt hiện tại — CHỈ ĐỌC ở đây, chỉ để hiện đối chiếu (xem trước); sửa bản tiếng
   *  Việt vẫn qua JobListingForm phía trên, KHÔNG qua component này. */
  job: JobListingSenderDetailView;
}

interface DraftState {
  title: string;
  description: string;
  requirements: string;
  benefits: string;
}

function toDraft(t: JobListingTranslationView | null): DraftState {
  return {
    title: t?.title ?? '',
    description: t?.description ?? '',
    requirements: t?.requirements ?? '',
    benefits: t?.benefits ?? '',
  };
}

type LoadState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; translation: JobListingTranslationView | null };

// Gói C (17/10/2026) — chỉnh sửa bản dịch tiếng Anh, gắn ngay dưới JobListingForm trên trang Sửa
// tin (tái dùng component/style hiện có, KHÔNG xây màn hình riêng — owner yêu cầu rõ). CHỈ 4
// trường văn bản; mọi trường khác (lương/liên hệ/hạn tuyển/toạ độ…) dùng CHUNG, không có ở đây.
//
// Xử lý 409 (CAS): owner yêu cầu rõ "giữ nội dung người dùng đang nhập khi gặp 409" — KHÔNG BAO
// GIỜ gọi setDraft() sau một lỗi 409 (chỉ setState({kind:'ready', translation}) để lấy
// content_version mới cho lần lưu tiếp theo; các ô nhập vẫn giữ nguyên y như người dùng đang gõ).
export function JobListingTranslationEditor({ job }: Props) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [draft, setDraft] = useState<DraftState>(toDraft(null));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const session = readSession();
    if (!session) {
      setState({ kind: 'error', message: 'Phiên đăng nhập đã hết hạn — tải lại trang.' });
      return;
    }
    let cancelled = false;
    getMyJobListingTranslation(job.id, session.accessToken)
      .then((t) => {
        if (cancelled) return;
        setState({ kind: 'ready', translation: t });
        setDraft(toDraft(t));
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error', message: 'Không tải được bản dịch tiếng Anh. Thử lại.' });
      });
    return () => {
      cancelled = true;
    };
  }, [job.id]);

  function set<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  // "Lấy phiên bản mới nhất" sau 409 — CHỈ cập nhật content_version để lần lưu tiếp theo dùng
  // đúng giá trị mới; KHÔNG đụng `draft` (giữ nguyên nội dung người dùng đang nhập).
  async function refreshVersionOnly() {
    const session = readSession();
    if (!session) return;
    try {
      const t = await getMyJobListingTranslation(job.id, session.accessToken);
      setState({ kind: 'ready', translation: t });
      setConflict(false);
      setError(null);
    } catch {
      // Lỗi ở đây không quan trọng hơn lỗi lưu gốc đã hiện — bỏ qua, người dùng có thể thử lại.
    }
  }

  async function handleSave() {
    if (state.kind !== 'ready') return;
    const session = readSession();
    if (!session) {
      setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setConflict(false);
    try {
      const saved = await saveJobListingTranslation(
        job.id,
        {
          title: draft.title.trim() || null,
          description: draft.description.trim() || null,
          requirements: draft.requirements.trim() || null,
          benefits: draft.benefits.trim() || null,
          expected_content_version: state.translation?.content_version,
        },
        session.accessToken,
      );
      setState({ kind: 'ready', translation: saved });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflict(true);
        setError(
          'Bản dịch vừa bị sửa hoặc duyệt bởi người khác. Nội dung bạn đang nhập vẫn được GIỮ trên màn hình — bấm "Lấy phiên bản mới nhất" rồi lưu lại.',
        );
      } else {
        setError(formErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    const session = readSession();
    if (!session) return;
    setSubmitting(true);
    setError(null);
    try {
      const saved = await submitJobListingTranslation(job.id, session.accessToken);
      setState({ kind: 'ready', translation: saved });
    } catch (err) {
      setError(formErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (state.kind === 'loading') {
    return <p aria-busy="true">Đang tải bản dịch tiếng Anh…</p>;
  }
  if (state.kind === 'error') {
    return (
      <p className={placeMgmtStyles.alert} role="alert">
        {state.message}
      </p>
    );
  }

  const translation = state.translation;
  const canSubmit =
    Boolean(draft.title.trim()) && Boolean(draft.description.trim()) && (!translation || translation.status === 'draft' || translation.status === 'rejected');

  return (
    <fieldset className={placeMgmtStyles.section}>
      <legend className={placeMgmtStyles.sectionTitle}>Phiên bản tiếng Anh (English version) — tuỳ chọn</legend>
      <p className={placeMgmtStyles.fieldHint}>
        Chỉ 4 trường dưới đây có bản dịch riêng. Lương, liên hệ, hạn tuyển, toạ độ và các trường khác dùng CHUNG với bản tiếng Việt —
        không nhập lại.
      </p>

      {translation && (
        <p className={placeMgmtStyles.fieldHint}>
          Trạng thái bản dịch: <strong>{JOB_LISTING_TRANSLATION_STATUS_LABELS[translation.status]}</strong>
          {translation.has_published && translation.status !== 'published' && (
            <> · Tin đang hiện công khai bằng bản ĐÃ DUYỆT trước đó — sửa tiếp ở đây KHÔNG ảnh hưởng tới bản đó cho tới khi bản mới được duyệt.</>
          )}
          {translation.is_published_stale && (
            <strong style={{ color: 'var(--warning, #b45309)' }}> · Bản đã duyệt có thể không còn khớp dữ kiện hiện tại (lương/ca làm/nơi làm đã đổi) — nên rà soát lại.</strong>
          )}
        </p>
      )}
      {translation?.status === 'rejected' && translation.review_note && (
        <p className={placeMgmtStyles.alert} role="alert">
          Lý do từ chối: {translation.review_note}
        </p>
      )}

      {error && (
        <p className={placeMgmtStyles.alert} role="alert">
          {error}
        </p>
      )}
      {conflict && (
        <div className={placeMgmtStyles.actions}>
          <button type="button" className={placeMgmtStyles.linkBtn} onClick={refreshVersionOnly}>
            Lấy phiên bản mới nhất (giữ nội dung đang nhập)
          </button>
        </div>
      )}

      <div className={uiStyles.field}>
        <label className={uiStyles.fieldLabel} htmlFor="jlt-title">
          Tiêu đề (tiếng Anh)
        </label>
        <input
          id="jlt-title"
          className={placeMgmtStyles.input}
          maxLength={200}
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
          disabled={submitting}
        />
      </div>
      <div className={uiStyles.field}>
        <label className={uiStyles.fieldLabel} htmlFor="jlt-description">
          Mô tả công việc (tiếng Anh)
        </label>
        <textarea
          id="jlt-description"
          className={placeMgmtStyles.textarea}
          rows={4}
          maxLength={4000}
          value={draft.description}
          onChange={(e) => set('description', e.target.value)}
          disabled={submitting}
        />
      </div>
      <div className={uiStyles.field}>
        <label className={uiStyles.fieldLabel} htmlFor="jlt-requirements">
          Yêu cầu (tiếng Anh)
        </label>
        <textarea
          id="jlt-requirements"
          className={placeMgmtStyles.textarea}
          rows={3}
          maxLength={2000}
          value={draft.requirements}
          onChange={(e) => set('requirements', e.target.value)}
          disabled={submitting}
        />
      </div>
      <div className={uiStyles.field}>
        <label className={uiStyles.fieldLabel} htmlFor="jlt-benefits">
          Quyền lợi (tiếng Anh)
        </label>
        <textarea
          id="jlt-benefits"
          className={placeMgmtStyles.textarea}
          rows={3}
          maxLength={2000}
          value={draft.benefits}
          onChange={(e) => set('benefits', e.target.value)}
          disabled={submitting}
        />
      </div>

      <div className={placeMgmtStyles.actions}>
        <button type="button" className={placeMgmtStyles.submitBtn} onClick={handleSave} disabled={submitting}>
          {submitting ? 'Đang lưu…' : 'Lưu nháp tiếng Anh'}
        </button>
        <button type="button" className={placeMgmtStyles.submitBtn} onClick={handleSubmit} disabled={submitting || !canSubmit}>
          Gửi duyệt bản dịch
        </button>
        <button type="button" className={placeMgmtStyles.linkBtn} onClick={() => setShowPreview((v) => !v)}>
          {showPreview ? 'Ẩn xem trước' : 'Xem trước VI/EN'}
        </button>
      </div>

      {showPreview && (
        <JobListingTranslationCompare
          source={{ title: job.title, description: job.description, requirements: job.requirements, benefits: job.benefits }}
          translation={draft}
        />
      )}
    </fieldset>
  );
}

function formErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 400) return err.message;
    if (err.status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
    if (err.status === 404) return 'Không tìm thấy bản dịch hoặc tin tuyển dụng.';
    if (err.status < 500) return err.message;
  }
  return 'Không lưu được. Vui lòng thử lại.';
}
