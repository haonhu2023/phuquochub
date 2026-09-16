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
} from './api/place-description.api';
import styles from './place-description-editor.module.css';

interface Props {
  placeId: string;
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

type PanelState =
  | { kind: 'closed' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; fields: Record<FieldKey, FieldState> };

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
export function PlaceDescriptionEditor({ placeId }: Props) {
  const { isAuthenticated, initializing } = useAuth();
  const [caps, setCaps] = useState<UserCapabilities>(NO_CAPABILITIES);
  const [panel, setPanel] = useState<PanelState>({ kind: 'closed' });
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
      setPanel({
        kind: 'ready',
        fields: {
          name: { vi: name.vi?.text ?? name.fallback_name ?? '', en: name.en?.text ?? '' },
          short_description: {
            vi: shortDescription.vi?.text ?? shortDescription.fallback_short_description ?? '',
            en: shortDescription.en?.text ?? '',
          },
          description: {
            vi: description.vi?.text ?? description.fallback_description ?? '',
            en: description.en?.text ?? '',
          },
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

  const SAVE_DRAFT_BY_FIELD: Record<FieldKey, typeof saveNameDraft> = {
    name: saveNameDraft,
    short_description: saveShortDescriptionDraft,
    description: saveDescriptionDraft,
  };
  const PUBLISH_BY_FIELD: Record<FieldKey, typeof publishNameDraft> = {
    name: publishNameDraft,
    short_description: publishShortDescriptionDraft,
    description: publishDescriptionDraft,
  };

  async function saveAllDrafts(fields: Record<FieldKey, FieldState>, accessToken: string): Promise<string[]> {
    const outcomes = await Promise.allSettled(
      FIELDS.map((field) =>
        SAVE_DRAFT_BY_FIELD[field](placeId, { vi: fields[field].vi, en: fields[field].en || undefined }, accessToken),
      ),
    );
    return outcomes
      .map((o, i) => (o.status === 'rejected' ? FIELD_LABELS[FIELDS[i]] : null))
      .filter((x): x is string => x !== null);
  }

  async function onSaveDraft() {
    if (panel.kind !== 'ready') return;
    const session = readSession();
    if (!session) return;
    setBusy(true);
    setNotice(null);
    try {
      const failedFields = await saveAllDrafts(panel.fields, session.accessToken);
      if (failedFields.length > 0) {
        setNotice(`Lưu nháp MỘT PHẦN — lỗi ở: ${failedFields.join(', ')}. Các trường còn lại đã lưu nháp.`);
      } else {
        setNotice('Đã lưu nháp — CHƯA hiển thị công khai. Bấm "Lưu và công khai" khi sẵn sàng.');
      }
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
      // Lưu nháp bản MỚI NHẤT của CẢ BA trường trước, rồi công khai — một thao tác cho người dùng
      // ("Lưu và công khai"), nhiều lệnh gọi API tuần tự/song song phía dưới.
      const failedSaves = await saveAllDrafts(panel.fields, session.accessToken);

      const publishOutcomes = await Promise.allSettled(
        FIELDS.map((field) => PUBLISH_BY_FIELD[field](placeId, session.accessToken)),
      );
      const failedPublishes: string[] = [];
      for (let i = 0; i < FIELDS.length; i += 1) {
        const outcome = publishOutcomes[i];
        const label = FIELD_LABELS[FIELDS[i]];
        if (outcome.status === 'rejected') {
          failedPublishes.push(label);
          continue;
        }
        const localeFailures = (outcome.value as PublishDescriptionResult[]).filter((r) => !r.ok);
        if (localeFailures.length > 0) {
          failedPublishes.push(`${label} (${localeFailures.map((f) => f.locale_code.toUpperCase()).join(', ')})`);
        }
      }

      const allFailed = [...failedSaves, ...failedPublishes];
      if (allFailed.length > 0) {
        setNotice(`Công khai MỘT PHẦN — lỗi ở: ${allFailed.join(', ')}. Các trường/locale còn lại đã công khai.`);
      } else {
        setNotice('Đã công khai — khách xem trang (kể cả chưa đăng nhập) sẽ thấy bản mới ngay.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={styles.editTrigger} onClick={() => void open()} aria-label="Sửa nội dung">
        ✏️
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
                {FIELDS.map((field) => (
                  <fieldset key={field} className={styles.fieldGroup}>
                    <legend>{FIELD_LABELS[field]}</legend>
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
