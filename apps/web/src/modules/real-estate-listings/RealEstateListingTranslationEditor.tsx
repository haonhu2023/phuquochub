'use client';

import { useEffect, useState } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import { getMyRealEstateListingTranslation, saveRealEstateListingTranslation, submitRealEstateListingTranslation } from './api/real-estate-listings.api';
import { REAL_ESTATE_LISTING_TRANSLATION_STATUS_LABELS, type RealEstateListingSenderView, type RealEstateListingTranslationView } from './types';
import { RealEstateListingTranslationCompare } from './RealEstateListingTranslationCompare';
import uiStyles from '@/components/ui/ui.module.css';
import placeMgmtStyles from '@/modules/place-management/place-management.module.css';

interface Props {
  listing: RealEstateListingSenderView;
}

interface DraftState {
  title: string;
  description: string;
  utilitiesNote: string;
  legalStatusNote: string;
}

function toDraft(t: RealEstateListingTranslationView | null): DraftState {
  return {
    title: t?.title ?? '',
    description: t?.description ?? '',
    utilitiesNote: t?.utilities_note ?? '',
    legalStatusNote: t?.legal_status_note ?? '',
  };
}

type LoadState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; translation: RealEstateListingTranslationView | null };

// Gói C phần 2/2 (17/10/2026) — cùng khuôn JobListingTranslationEditor.tsx (xem ghi chú đầy đủ ở
// đó, kể cả xử lý 409: KHÔNG BAO GIỜ gọi setDraft() sau một lỗi 409, giữ nguyên nội dung đang nhập).
// Field RIÊNG cho BĐS: title/description/utilities_note/legal_status_note.
export function RealEstateListingTranslationEditor({ listing }: Props) {
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
    getMyRealEstateListingTranslation(listing.id, session.accessToken)
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
  }, [listing.id]);

  function set<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function refreshVersionOnly() {
    const session = readSession();
    if (!session) return;
    try {
      const t = await getMyRealEstateListingTranslation(listing.id, session.accessToken);
      setState({ kind: 'ready', translation: t });
      setConflict(false);
      setError(null);
    } catch {
      // Bỏ qua — lỗi ở đây không quan trọng hơn lỗi lưu gốc đã hiện.
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
      const saved = await saveRealEstateListingTranslation(
        listing.id,
        {
          title: draft.title.trim() || null,
          description: draft.description.trim() || null,
          utilities_note: draft.utilitiesNote.trim() || null,
          legal_status_note: draft.legalStatusNote.trim() || null,
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
      const saved = await submitRealEstateListingTranslation(listing.id, session.accessToken);
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
        Chỉ 4 trường dưới đây có bản dịch riêng. Giá, diện tích, liên hệ, hạn đăng, toạ độ/địa chỉ và các trường khác dùng CHUNG với
        bản tiếng Việt — không nhập lại.
      </p>

      {translation && (
        <p className={placeMgmtStyles.fieldHint}>
          Trạng thái bản dịch: <strong>{REAL_ESTATE_LISTING_TRANSLATION_STATUS_LABELS[translation.status]}</strong>
          {translation.has_published && translation.status !== 'published' && (
            <> · Tin đang hiện công khai bằng bản ĐÃ DUYỆT trước đó — sửa tiếp ở đây KHÔNG ảnh hưởng tới bản đó cho tới khi bản mới được duyệt.</>
          )}
          {translation.is_published_stale && (
            <strong style={{ color: 'var(--warning, #b45309)' }}> · Bản đã duyệt có thể không còn khớp dữ kiện hiện tại (giá/diện tích/điều kiện đã đổi) — nên rà soát lại.</strong>
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
        <label className={uiStyles.fieldLabel} htmlFor="relt-title">
          Tiêu đề (tiếng Anh)
        </label>
        <input
          id="relt-title"
          className={placeMgmtStyles.input}
          maxLength={200}
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
          disabled={submitting}
        />
      </div>
      <div className={uiStyles.field}>
        <label className={uiStyles.fieldLabel} htmlFor="relt-description">
          Mô tả (tiếng Anh)
        </label>
        <textarea
          id="relt-description"
          className={placeMgmtStyles.textarea}
          rows={4}
          maxLength={4000}
          value={draft.description}
          onChange={(e) => set('description', e.target.value)}
          disabled={submitting}
        />
      </div>
      <div className={uiStyles.field}>
        <label className={uiStyles.fieldLabel} htmlFor="relt-utilities">
          Điện/nước/phí (tiếng Anh)
        </label>
        <textarea
          id="relt-utilities"
          className={placeMgmtStyles.textarea}
          rows={2}
          maxLength={500}
          value={draft.utilitiesNote}
          onChange={(e) => set('utilitiesNote', e.target.value)}
          disabled={submitting}
        />
      </div>
      <div className={uiStyles.field}>
        <label className={uiStyles.fieldLabel} htmlFor="relt-legal">
          Tình trạng pháp lý (tiếng Anh)
        </label>
        <textarea
          id="relt-legal"
          className={placeMgmtStyles.textarea}
          rows={2}
          maxLength={500}
          value={draft.legalStatusNote}
          onChange={(e) => set('legalStatusNote', e.target.value)}
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
        <RealEstateListingTranslationCompare
          source={{ title: listing.title, description: listing.description, utilitiesNote: listing.utilities_note, legalStatusNote: listing.legal_status_note }}
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
    if (err.status === 404) return 'Không tìm thấy bản dịch hoặc tin bất động sản.';
    if (err.status < 500) return err.message;
  }
  return 'Không lưu được. Vui lòng thử lại.';
}
