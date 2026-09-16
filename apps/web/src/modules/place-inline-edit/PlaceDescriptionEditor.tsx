'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/modules/auth/AuthProvider';
import { readSession } from '@/modules/auth/session';
import { fetchCapabilities } from '@/modules/auth/api/me.api';
import { NO_CAPABILITIES, type UserCapabilities } from '@/modules/auth/capabilities';
import { ApiError } from '@/lib/http';
import {
  getDescriptionDraft,
  publishDescriptionDraft,
  saveDescriptionDraft,
  type DescriptionDraftResponse,
} from './api/place-description.api';
import styles from './place-description-editor.module.css';

interface Props {
  placeId: string;
}

type PanelState =
  | { kind: 'closed' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; vi: string; en: string; original: DescriptionDraftResponse };

/**
 * Nút ✏️ + drawer chỉnh sửa mô tả VI/EN NGAY TRÊN trang công khai (content_owner, 2026-09-16).
 *
 * Client Component nhúng vào trang Server Component (`hotels/[slug]/page.tsx`) — cùng khuôn
 * `ReviewsSection.tsx` đã dùng trước đó (component tự kiểm tra `useAuth()`/năng lực, page cha
 * không cần biết gì về phiên đăng nhập). LUÔN render trong HTML server-side; component TỰ quyết
 * định có hiện gì hay không sau khi hydrate — khách chưa đăng nhập/không đủ quyền không thấy gì.
 *
 * `caps.canEditorial` (không phải một cờ riêng cho content_owner) — vì đó CHÍNH LÀ quyền thật cần
 * để gọi được `POST /places/:id/description/draft` (`Place.Edit.Managed`, content_owner/contributor
 * đều thoả qua `Place.Edit.Any`). Đây THUẦN TUÝ là hiển thị — backend vẫn là nơi quyết định duy
 * nhất; cờ sai/thiếu chỉ ẩn nút, API vẫn tự chặn bằng PermissionsGuard nếu ai đó cố gọi thẳng.
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
      const draft = await getDescriptionDraft(placeId, session.accessToken);
      setPanel({
        kind: 'ready',
        vi: draft.vi?.text ?? draft.fallback_description ?? '',
        en: draft.en?.text ?? '',
        original: draft,
      });
    } catch (err) {
      setPanel({
        kind: 'error',
        message: err instanceof ApiError && err.status === 403
          ? 'Bạn không có quyền sửa mô tả của địa điểm này.'
          : 'Không tải được bản nháp mô tả.',
      });
    }
  }

  function close() {
    setPanel({ kind: 'closed' });
    setPreview(false);
    setNotice(null);
  }

  async function onSaveDraft() {
    if (panel.kind !== 'ready') return;
    const session = readSession();
    if (!session) return;
    setBusy(true);
    setNotice(null);
    try {
      await saveDescriptionDraft(placeId, { vi: panel.vi, en: panel.en || undefined }, session.accessToken);
      setNotice('Đã lưu nháp — CHƯA hiển thị công khai. Bấm "Lưu và công khai" khi sẵn sàng.');
    } catch (err) {
      setNotice(err instanceof ApiError ? `Không lưu được nháp: ${err.message}` : 'Không lưu được nháp.');
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
      // Lưu nháp bản MỚI NHẤT trước, rồi công khai đúng bản vừa lưu đó — một thao tác cho người
      // dùng ("Lưu và công khai"), hai lệnh gọi API tuần tự phía dưới.
      await saveDescriptionDraft(placeId, { vi: panel.vi, en: panel.en || undefined }, session.accessToken);
      const results = await publishDescriptionDraft(placeId, session.accessToken);
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        setNotice(
          `Công khai MỘT PHẦN — lỗi ở: ${failed.map((f) => f.locale_code.toUpperCase()).join(', ')}. Các locale còn lại đã công khai.`,
        );
      } else {
        setNotice('Đã công khai — khách xem trang (kể cả chưa đăng nhập) sẽ thấy bản mới ngay.');
      }
    } catch (err) {
      setNotice(err instanceof ApiError ? `Không công khai được: ${err.message}` : 'Không công khai được.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={styles.editTrigger} onClick={() => void open()} aria-label="Sửa mô tả">
        ✏️
      </button>
      {panel.kind !== 'closed' && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Sửa mô tả">
          <div className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <h2>Sửa mô tả</h2>
              <button type="button" onClick={close} aria-label="Đóng">
                ✕
              </button>
            </div>

            {panel.kind === 'loading' && <p>Đang tải…</p>}
            {panel.kind === 'error' && <p className={styles.error}>{panel.message}</p>}

            {panel.kind === 'ready' && (
              <div className={styles.drawerBody}>
                <label className={styles.field}>
                  <span>Mô tả (Tiếng Việt)</span>
                  <textarea
                    value={panel.vi}
                    onChange={(e) => setPanel((p) => (p.kind === 'ready' ? { ...p, vi: e.target.value } : p))}
                    rows={5}
                  />
                </label>
                <label className={styles.field}>
                  <span>Mô tả (English)</span>
                  <textarea
                    value={panel.en}
                    onChange={(e) => setPanel((p) => (p.kind === 'ready' ? { ...p, en: e.target.value } : p))}
                    rows={5}
                  />
                </label>

                <button type="button" onClick={() => setPreview((p) => !p)}>
                  {preview ? 'Ẩn xem trước' : 'Xem trước'}
                </button>
                {preview && (
                  <div className={styles.previewBox}>
                    <p>
                      <strong>VI:</strong> {panel.vi || '(trống)'}
                    </p>
                    <p>
                      <strong>EN:</strong> {panel.en || '(trống)'}
                    </p>
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
