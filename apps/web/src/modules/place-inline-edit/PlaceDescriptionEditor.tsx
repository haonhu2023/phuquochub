'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/modules/auth/AuthProvider';
import { readSession } from '@/modules/auth/session';
import { fetchCapabilities } from '@/modules/auth/api/me.api';
import { NO_CAPABILITIES, type UserCapabilities } from '@/modules/auth/capabilities';
import { ApiError } from '@/lib/http';
import {
  getDescriptionDraft,
  getNameDraft,
  getShortDescriptionDraft,
  publishDescriptionDraft,
  publishNameDraft,
  publishShortDescriptionDraft,
  saveDescriptionDraft,
  saveNameDraft,
  saveShortDescriptionDraft,
  type PublishDescriptionResult,
  type DraftSaveInput,
  type DraftPublishInput,
} from './api/place-description.api';
import styles from './place-description-editor.module.css';
import { getEditorialCategory } from '@/modules/editorial/editorialCategories';

interface Props {
  placeId: string;
  categorySlug?: string | null;
  triggerLabel?: string;
}

interface FieldState {
  vi: string;
  en: string;
}

const FIELDS = ['name', 'short_description', 'description'] as const;
type FieldKey = (typeof FIELDS)[number];

const FIELD_LABELS: Record<FieldKey, string> = {
  name: 'Tên hiển thị',
  short_description: 'Mô tả ngắn',
  description: 'Mô tả chi tiết',
};

type SaveSummary = { saved: FieldKey[]; conflicts: FieldKey[]; errors: FieldKey[]; draftIds: DraftIdsByField };

/** Id bản nháp VI/EN hiện hành đã đọc (CAS), cho cả ba trường. */
/** Bản nháp hiện hành của một locale: id (CAS) và trạng thái duyệt (PENDING/NEEDS_CHANGES/APPROVED). */
type DraftSlot = { id: string; status: string };
type DraftIdsByField = Record<FieldKey, { vi: DraftSlot | null; en: DraftSlot | null }>;

type PanelState =
  | { kind: 'closed' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; fields: Record<FieldKey, FieldState>; loaded: Record<FieldKey, FieldState>; draftIds: DraftIdsByField };

/**
 * Nút ✏️ + drawer chỉnh sửa NỘI DUNG địa điểm (tên/mô tả ngắn/mô tả chi tiết, cả VI/EN) NGAY TRÊN
 * trang công khai (content_owner, 2026-09-16; mở rộng đủ ba trường 2026-09-17, requirement 1 —
 * "giữ yêu cầu nút sửa ngay trên trang" cho MỌI trường có bản dịch, không chỉ mô tả).
 *
 * Client Component nhúng vào trang Server Component (`hotels/[slug]/page.tsx`) — cùng khuôn
 * `ReviewsSection.tsx` đã dùng trước đó (component tự kiểm tra `useAuth()`/năng lực, page cha
 * không cần biết gì về phiên đăng nhập). LUÔN render trong HTML server-side; component TỰ quyết
 * định có hiện gì hay không sau khi hydrate — khách chưa đăng nhập/không đủ quyền không thấy gì.
 *
 * Ba trường ĐỘC LẬP ở tầng API (route/field_key/fallback-key riêng — xem PlacesService's
 * get/save/publish{Name,ShortDescription,Description}Draft()), nhưng gộp vào MỘT lần tải/lưu/công
 * khai ở đây cho gọn UX: một nút "Lưu nháp"/"Lưu và công khai" áp dụng cho cả ba, kết quả báo RÕ
 * TỪNG trường + từng locale thất bại (KHÔNG che giấu thất bại một phần).
 *
 * `caps.canEditorial` (không phải một cờ riêng cho content_owner) — vì đó CHÍNH LÀ quyền thật cần
 * để gọi được các route trên (`Place.Edit.Managed`, content_owner/contributor đều thoả qua
 * `Place.Edit.Any`). Đây THUẦN TUÝ là hiển thị — backend vẫn là nơi quyết định duy nhất; cờ sai/
 * thiếu chỉ ẩn nút, API vẫn tự chặn bằng PermissionsGuard nếu ai đó cố gọi thẳng.
 */
export function PlaceDescriptionEditor({ placeId, categorySlug, triggerLabel }: Props) {
  const editorialGroup = getEditorialCategory(categorySlug);
  const { isAuthenticated, initializing } = useAuth();
  const [caps, setCaps] = useState<UserCapabilities>(NO_CAPABILITIES);
  const [panel, setPanel] = useState<PanelState>({ kind: 'closed' });
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Locale được chọn để công khai. Mặc định: chỉ tiếng Việt. Tiếng Anh phải được bật rõ ràng.
  const [publishLocales, setPublishLocales] = useState<{ vi: boolean; en: boolean }>({ vi: true, en: false });

  useEffect(() => {
    if (!isAuthenticated) return;
    const session = readSession();
    if (!session) return;
    let cancelled = false;
    void fetchCapabilities(session.accessToken).then((c) => {
      if (!cancelled) setCaps(c);
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  if (initializing || !isAuthenticated || !caps.canEditorial) {
    return null;
  }

  async function open() {
    setPanel({ kind: 'loading' });
    setNotice(null);
    const session = readSession();
    if (!session) {
      setPanel({ kind: 'error', message: 'Phiên đăng nhập đã hết hạn — tải lại trang.' });
      return;
    }
    try {
      const [name, shortDescription, description] = await Promise.all([
        getNameDraft(placeId, session.accessToken),
        getShortDescriptionDraft(placeId, session.accessToken),
        getDescriptionDraft(placeId, session.accessToken),
      ]);
      const fields: Record<FieldKey, FieldState> = {
        name: { vi: name.vi?.text ?? name.fallback_name ?? '', en: name.en?.text ?? '' },
        short_description: {
          vi: shortDescription.vi?.text ?? shortDescription.fallback_short_description ?? '',
          en: shortDescription.en?.text ?? '',
        },
        description: {
          vi: description.vi?.text ?? description.fallback_description ?? '',
          en: description.en?.text ?? '',
        },
      };
      setPanel({
        kind: 'ready',
        fields,
        loaded: fields,
        draftIds: {
          name: { vi: name.vi ? { id: name.vi.id, status: name.vi.human_review_status } : null, en: name.en ? { id: name.en.id, status: name.en.human_review_status } : null },
          short_description: { vi: shortDescription.vi ? { id: shortDescription.vi.id, status: shortDescription.vi.human_review_status } : null, en: shortDescription.en ? { id: shortDescription.en.id, status: shortDescription.en.human_review_status } : null },
          description: { vi: description.vi ? { id: description.vi.id, status: description.vi.human_review_status } : null, en: description.en ? { id: description.en.id, status: description.en.human_review_status } : null },
        },
      });
    } catch (err) {
      setPanel({
        kind: 'error',
        message:
          err instanceof ApiError && err.status === 403
            ? 'Bạn không có quyền sửa nội dung của địa điểm này.'
            : 'Không tải được bản nháp nội dung.',
      });
    }
  }

  function close() {
    setPanel({ kind: 'closed' });
    setPreview(false);
    setNotice(null);
  }

  function updateField(field: FieldKey, locale: 'vi' | 'en', value: string) {
    setPanel((p) => (p.kind === 'ready' ? { ...p, fields: { ...p.fields, [field]: { ...p.fields[field], [locale]: value } } } : p));
  }

  // Trường được coi là ĐÃ SỬA khi VI hoặc EN khác bản đã tải.
  // Có thay đổi GỬI ĐƯỢC: VI đã đổi, hoặc EN đã đổi và không rỗng (EN rỗng không được lưu).
  function isDirty(field: FieldKey, fields: Record<FieldKey, FieldState>, loaded: Record<FieldKey, FieldState>): boolean {
    return fields[field].vi !== loaded[field].vi || (fields[field].en !== loaded[field].en && fields[field].en.trim() !== '');
  }

  const PENDING_REVIEW = ['PENDING', 'NEEDS_CHANGES'];
  function needsReview(slot: DraftSlot | null): boolean {
    return slot !== null && PENDING_REVIEW.includes(slot.status);
  }

  function withIds(
    ids: DraftIdsByField,
    field: FieldKey,
    rows: Array<{ id: string; locale_code: string; human_review_status: string }>,
  ): DraftIdsByField {
    const next: DraftIdsByField = { ...ids, [field]: { ...ids[field] } };
    for (const row of rows) {
      const slot = { id: row.id, status: row.human_review_status };
      if (row.locale_code === 'vi') next[field].vi = slot;
      if (row.locale_code === 'en') next[field].en = slot;
    }
    return next;
  }

  // Lưu nháp các trường ĐÃ SỬA, mỗi locale kèm id bản nháp hiện hành đã đọc (CAS).
  // Trường không sửa không được gửi: không tạo revision vô ích.
  async function saveDirtyDrafts(
    fields: Record<FieldKey, FieldState>,
    loaded: Record<FieldKey, FieldState>,
    draftIds: DraftIdsByField,
    accessToken: string,
  ): Promise<SaveSummary> {
    const dirty = FIELDS.filter((f) => isDirty(f, fields, loaded));
    const outcomes = await Promise.allSettled(
      dirty.map((field) => {
        const ids = draftIds[field];
        const viChanged = fields[field].vi !== loaded[field].vi;
        const enChanged = fields[field].en !== loaded[field].en && fields[field].en.trim() !== '';
        // Chỉ gửi locale ĐÃ ĐỔI, kèm id của chính locale đó: locale không đổi không bị ghi lại
        // và không bị kéo theo conflict của locale khác.
        const input: DraftSaveInput = {
          ...(viChanged ? { vi: fields[field].vi, expected_vi_id: ids.vi?.id ?? null } : {}),
          ...(enChanged ? { en: fields[field].en, expected_en_id: ids.en?.id ?? null } : {}),
        };
        if (field === 'name') return saveNameDraft(placeId, input, accessToken);
        return field === 'description'
          ? saveDescriptionDraft(placeId, input, accessToken)
          : saveShortDescriptionDraft(placeId, input, accessToken);
      }),
    );
    let nextIds = draftIds;
    const saved: FieldKey[] = [];
    const conflicts: FieldKey[] = [];
    const errors: FieldKey[] = [];
    outcomes.forEach((o, i) => {
      const field = dirty[i];
      if (o.status === 'fulfilled') {
        saved.push(field);
        nextIds = withIds(nextIds, field, o.value);
      } else if (o.reason instanceof ApiError && o.reason.status === 409) {
        conflicts.push(field);
      } else {
        errors.push(field);
      }
    });
    return { saved, conflicts, errors, draftIds: nextIds };
  }

  // Sau khi lưu: nhận id/trạng thái mới; trường lưu thành công được coi là bản đã tải.
  function applySave(summary: SaveSummary) {
    setPanel((p) => {
      if (p.kind !== 'ready') return p;
      const loaded = { ...p.loaded };
      for (const field of summary.saved) loaded[field] = p.fields[field];
      return { ...p, loaded, draftIds: summary.draftIds };
    });
  }

  // Lập kế hoạch công khai: chỉ các locale ĐÃ CHỌN, của trường KHÔNG có lỗi lưu, và có bản nháp đang chờ duyệt.
  // Trường đã sửa nhưng không lưu được (unsavedChange) bị bỏ qua. Bản đã APPROVED không được gửi lại.
  function planPublish(
    fields: Record<FieldKey, FieldState>,
    loaded: Record<FieldKey, FieldState>,
    ids: DraftIdsByField,
    locales: { vi: boolean; en: boolean },
    saved: FieldKey[],
  ): Array<{ field: FieldKey; locales: Array<'vi' | 'en'> }> {
    const plans: Array<{ field: FieldKey; locales: Array<'vi' | 'en'> }> = [];
    for (const field of FIELDS) {
      const unsavedChange = isDirty(field, fields, loaded) && !saved.includes(field);
      if (unsavedChange) continue;
      const wanted: Array<'vi' | 'en'> = [];
      if (locales.vi && needsReview(ids[field].vi)) wanted.push('vi');
      if (locales.en && fields[field].en.trim() !== '' && needsReview(ids[field].en)) wanted.push('en');
      if (wanted.length > 0) plans.push({ field, locales: wanted });
    }
    return plans;
  }

  // Công khai theo id đúng các locale đã lập kế hoạch. Mỗi kết quả đọc theo locale: ok:false không được báo thành công.
  async function publishPlanned(
    plans: Array<{ field: FieldKey; locales: Array<'vi' | 'en'> }>,
    ids: DraftIdsByField,
    accessToken: string,
  ): Promise<{ published: string[]; notApplied: string[]; approved: Array<{ field: FieldKey; locale: 'vi' | 'en' }> }> {
    const published: string[] = [];
    const notApplied: string[] = [];
    const approved: Array<{ field: FieldKey; locale: 'vi' | 'en' }> = [];
    const runs = plans.map((plan) => {
      const body: DraftPublishInput = {};
      for (const l of plan.locales) {
        const slot = ids[plan.field][l];
        if (!slot) continue;
        if (l === 'vi') body.vi_translation_id = slot.id;
        else body.en_translation_id = slot.id;
      }
      const call =
        plan.field === 'name'
          ? publishNameDraft(placeId, body, accessToken)
          : plan.field === 'description'
            ? publishDescriptionDraft(placeId, body, accessToken)
            : publishShortDescriptionDraft(placeId, body, accessToken);
      return { plan, call };
    });
    const outcomes = await Promise.allSettled(runs.map((r) => r.call));
    outcomes.forEach((o, i) => {
      const { plan } = runs[i];
      if (o.status === 'rejected') {
        for (const l of plan.locales) notApplied.push(FIELD_LABELS[plan.field] + ' (' + l.toUpperCase() + '): lỗi khi công khai');
        return;
      }
      for (const row of o.value) {
        const locale = row.locale_code === 'en' ? 'en' : 'vi';
        if (!plan.locales.includes(locale)) continue; // server trả đúng những locale đã gửi
        const label = FIELD_LABELS[plan.field] + ' (' + locale.toUpperCase() + ')';
        if (row.ok === true) {
          published.push(label);
          approved.push({ field: plan.field, locale });
        } else {
          notApplied.push(label + ': ' + (row.status === 409 ? 'bản đã đổi sau khi bạn đọc — tải lại để xem bản mới' : 'lỗi khi công khai'));
        }
      }
    });
    return { published, notApplied, approved };
  }

  // Đánh dấu APPROVED cho đúng các locale server đã duyệt ok:true (retry sẽ không gửi lại).
  function applyApproved(approved: Array<{ field: FieldKey; locale: 'vi' | 'en' }>) {
    if (approved.length === 0) return;
    setPanel((p) => {
      if (p.kind !== 'ready') return p;
      const next: DraftIdsByField = { ...p.draftIds };
      for (const { field, locale } of approved) {
        const slot = next[field][locale];
        if (slot) next[field] = { ...next[field], [locale]: { ...slot, status: 'APPROVED' } };
      }
      return { ...p, draftIds: next };
    });
  }

  function failureParts(summary: SaveSummary): string[] {
    return [
      ...summary.conflicts.map((f) => FIELD_LABELS[f] + ': bản đã đổi sau khi bạn đọc — tải lại để xem bản mới'),
      ...summary.errors.map((f) => FIELD_LABELS[f] + ': lỗi khi lưu nháp'),
    ];
  }

  async function onSaveDraft() {
    if (panel.kind !== 'ready') return;
    const session = readSession();
    if (!session) return;
    setBusy(true);
    setNotice(null);
    try {
      const summary = await saveDirtyDrafts(panel.fields, panel.loaded, panel.draftIds, session.accessToken);
      applySave(summary);
      const parts: string[] = [];
      if (summary.saved.length > 0) parts.push('Đã lưu nháp: ' + summary.saved.map((f) => FIELD_LABELS[f]).join(', ') + '. CHƯA hiển thị công khai.');
      const failed = failureParts(summary);
      if (failed.length > 0) parts.push('Chưa lưu: ' + failed.join('; ') + '. Nội dung bạn nhập vẫn còn trong ô.');
      if (parts.length === 0) parts.push('Không có thay đổi để lưu.');
      setNotice(parts.join(' '));
    } finally {
      setBusy(false);
    }
  }

  async function onPublish() {
    if (panel.kind !== 'ready') return;
    const session = readSession();
    if (!session) return;
    setBusy(true);
    setNotice(null);
    try {
      const summary = await saveDirtyDrafts(panel.fields, panel.loaded, panel.draftIds, session.accessToken);
      applySave(summary);
      const plans = planPublish(panel.fields, panel.loaded, summary.draftIds, publishLocales, summary.saved);
      const pub = await publishPlanned(plans, summary.draftIds, session.accessToken);
      applyApproved(pub.approved);
      const parts: string[] = [];
      if (pub.published.length > 0) parts.push('Đã công khai: ' + pub.published.join(', ') + '.');
      const failed = [...pub.notApplied, ...failureParts(summary)];
      if (failed.length > 0) parts.push('Chưa áp dụng: ' + failed.join('; ') + '. Nội dung bạn nhập vẫn còn trong ô.');
      if (!publishLocales.en) parts.push('Bản tiếng Anh chưa được công khai (chưa chọn) và vẫn là nháp.');
      if (pub.published.length === 0 && failed.length === 0) parts.push('Không có thay đổi để công khai.');
      setNotice(parts.join(' '));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={triggerLabel ? styles.textTrigger : styles.editTrigger} onClick={() => void open()} aria-label={triggerLabel ?? 'Sửa nội dung'}>
        {triggerLabel ?? '✏️'}
      </button>
      {panel.kind !== 'closed' && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Sửa nội dung">
          <div className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <h2>Sửa nội dung</h2>
              <button type="button" onClick={close} aria-label="Đóng">
                ✕
              </button>
            </div>

            {panel.kind === 'loading' && <p>Đang tải…</p>}
            {panel.kind === 'error' && <p className={styles.error}>{panel.message}</p>}

            {panel.kind === 'ready' && (
              <div className={styles.drawerBody}>
                {editorialGroup && <p className={styles.categoryGuidance}>Gợi ý cho {editorialGroup.title.toLowerCase()}: {editorialGroup.detailPrompt} Chỉ ghi điều đã kiểm tra; chưa rõ thì để trống.</p>}
                {FIELDS.map((field) => (
                  <fieldset key={field} className={styles.fieldGroup}>
                    <legend>{FIELD_LABELS[field]}</legend>
                    {editorialGroup && field === 'short_description' && <p className={styles.categoryGuidance}>{editorialGroup.shortPrompt}</p>}
                    {editorialGroup && field === 'description' && <p className={styles.categoryGuidance}>{editorialGroup.detailPrompt}</p>}
                    <label className={styles.field}>
                      <span>{FIELD_LABELS[field]} (Tiếng Việt)</span>
                      <textarea
                        value={panel.fields[field].vi}
                        onChange={(e) => updateField(field, 'vi', e.target.value)}
                        rows={field === 'description' ? 5 : 2}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>{FIELD_LABELS[field]} (English)</span>
                      <textarea
                        value={panel.fields[field].en}
                        onChange={(e) => updateField(field, 'en', e.target.value)}
                        rows={field === 'description' ? 5 : 2}
                      />
                    </label>
                  </fieldset>
                ))}

                <button type="button" onClick={() => setPreview((p) => !p)}>
                  {preview ? 'Ẩn xem trước' : 'Xem trước'}
                </button>
                {preview && (
                  <div className={styles.previewBox}>
                    {FIELDS.map((field) => (
                      <div key={field}>
                        <p>
                          <strong>{FIELD_LABELS[field]} — VI:</strong> {panel.fields[field].vi || '(trống)'}
                        </p>
                        <p>
                          <strong>{FIELD_LABELS[field]} — EN:</strong> {panel.fields[field].en || '(trống)'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {notice && <p className={styles.notice}>{notice}</p>}

                <div>
                  <label>
                    <input type="checkbox" checked={publishLocales.vi} onChange={(e) => setPublishLocales((p) => ({ ...p, vi: e.target.checked }))} /> Công khai tiếng Việt
                  </label>{' '}
                  <label>
                    <input type="checkbox" checked={publishLocales.en} onChange={(e) => setPublishLocales((p) => ({ ...p, en: e.target.checked }))} /> Công khai tiếng Anh
                  </label>
                </div>
                <div className={styles.actions}>
                  <button type="button" onClick={() => void onSaveDraft()} disabled={busy}>
                    Lưu nháp
                  </button>
                  <button type="button" onClick={() => void onPublish()} disabled={busy}>
                    Lưu và công khai
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
