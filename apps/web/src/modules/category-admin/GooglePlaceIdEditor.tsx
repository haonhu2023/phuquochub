'use client';

import { useEffect, useState } from 'react';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import {
  getExternalIdentifiers,
  upsertGooglePlaceId,
  confirmGooglePlaceId,
  revokeGooglePlaceIdVerification,
  type ExternalIdentifier,
} from '@/modules/place-external-identifiers/api/place-external-identifiers.api';
import { createSource } from '@/modules/sources/api/sources.api';
import styles from '@/modules/place-management/place-management.module.css';
import uiStyles from '@/components/ui/ui.module.css';

interface Props {
  placeId: string;
  /** Dùng để dựng link "mở hồ sơ Google để đối chiếu" — chỉ cho UI, không gửi lên server. */
  placeName?: string;
}

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; current: ExternalIdentifier | null };

const FORBIDDEN_CONFIRM_MESSAGE = 'Bạn không có quyền xác nhận — chỉ vai trò quản trị/kiểm duyệt phù hợp (đã đối chiếu hồ sơ Google) mới xác nhận/thu hồi được.';

function confirmErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return FORBIDDEN_CONFIRM_MESSAGE;
    if (err.status === 404) return 'Chưa có Google Place ID nào để xác nhận — nhập ID trước.';
    // 409: ai đó đổi ID giữa lúc trang này tải và lúc bấm xác nhận/thu hồi — err.message (từ
    // server) đã nêu rõ ID cũ/mới; thêm hướng xử lý cụ thể ở đây.
    if (err.status === 409) return `${err.message} Tải lại trang để lấy ID mới nhất.`;
    if (err.status < 500) return err.message;
  }
  return 'Thao tác thất bại. Vui lòng thử lại.';
}

/**
 * Google Place ID (gói "mở đúng hồ sơ Google Maps", 2026-10-16) — nhúng vào EditPlaceView cho
 * MỌI category (không riêng hotel/restaurant). Cùng khuôn HotelDetailsEditor (tự tải, tự lưu,
 * không phụ thuộc PlaceForm) nhưng KHÔNG dùng contentVersion CAS của place — identifier là
 * sub-resource độc lập, tự có idempotency/conflict check riêng.
 *
 * HAI quyền KHÁC NHAU trên cùng form này (xem apps/api PlaceExternalIdentifiersController's ghi
 * chú đầy đủ): nhập/sửa ID dùng `Place.Edit.Managed` (quyền trang này đã yêu cầu để vào được —
 * luôn thành công); xác nhận/thu hồi dùng `PlaceExternalIdentifier.Verify` — RIÊNG, phần lớn
 * người quản lý MỘT place cụ thể sẽ KHÔNG có quyền đó và sẽ thấy lỗi 403 rõ ràng khi bấm — đây là
 * hành vi ĐÚNG, không phải lỗi UI. KHÔNG phải cơ chế duyệt hai người độc lập: `content_owner` giữ
 * CẢ HAI permission và được phép tự nhập rồi tự xác nhận ở MVP này, miễn đã thật sự đối chiếu
 * (audit ghi đúng actor/thao tác — server không kiểm tra họ có "đối chiếu thật" hay không).
 */
export function GooglePlaceIdEditor({ placeId, placeName }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [externalId, setExternalId] = useState('');
  const [newSourceTitle, setNewSourceTitle] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Trì hoãn qua microtask — cùng lý do HotelDetailsEditor.tsx (react-hooks/set-state-in-effect).
    void Promise.resolve().then(() => {
      const session = readSession();
      if (!session) {
        if (!cancelled) setState({ kind: 'error', message: 'Phiên đăng nhập đã hết hạn — tải lại trang.' });
        return;
      }
      getExternalIdentifiers(placeId, session.accessToken)
        .then((rows) => {
          if (cancelled) return;
          const current = rows.find((r) => r.provider === 'GOOGLE_PLACES' && r.is_primary) ?? null;
          setState({ kind: 'ready', current });
          if (current) setExternalId(current.external_id);
        })
        .catch(() => {
          if (!cancelled) setState({ kind: 'error', message: 'Không tải được định danh Google Maps.' });
        });
    });
    return () => {
      cancelled = true;
    };
  }, [placeId]);

  if (state.kind === 'loading') return <p style={{ color: 'var(--muted)' }}>Đang tải định danh Google Maps…</p>;
  if (state.kind === 'error') return <p className={styles.alert}>{state.message}</p>;

  // Lỗi thật phát hiện 16/10/2026 (owner nghiệm thu Bãi Sao — lưu ID thành công, verified_at vẫn
  // null, audit_logs KHÔNG có dòng confirm nào): `readSession()` trả null khi phiên đã hết hạn/bị
  // thu hồi (vd `auth.refresh.reuse_detected`) GIỮA LÚC trang đã tải và lúc bấm — nhưng 3 hàm này
  // trước đây chỉ `if (!session) return;` IM LẶNG, không báo gì, không gửi request nào, nên KHÔNG
  // CÓ audit log (đúng, vì request chưa từng rời trình duyệt) VÀ người dùng không thấy lỗi nào để
  // biết phải tải lại trang. Nút vẫn hiện bình thường, bấm vẫn "có vẻ hoạt động" nhưng không làm
  // gì — đây là lỗi UI, KHÔNG phải thao tác sai của người dùng.
  const SESSION_EXPIRED_MESSAGE = 'Phiên đăng nhập đã hết hạn — tải lại trang và đăng nhập lại trước khi lưu/xác nhận.';

  async function onSave() {
    const session = readSession();
    if (!session) {
      setError(SESSION_EXPIRED_MESSAGE);
      return;
    }
    setError(null);
    setNotice(null);

    if (!externalId.trim()) {
      setError('Nhập Google Place ID trước khi lưu.');
      return;
    }

    setBusy(true);
    try {
      let sourceId: string | undefined;
      if (newSourceTitle.trim() || newSourceUrl.trim()) {
        const source = await createSource(
          { type: 'official_website', kind: 'url', title: newSourceTitle.trim() || undefined, url: newSourceUrl.trim() || undefined },
          session.accessToken,
        );
        sourceId = source.id;
      }

      const updated = await upsertGooglePlaceId(
        placeId,
        { external_id: externalId.trim(), ...(sourceId ? { source_id: sourceId } : {}) },
        session.accessToken,
      );
      setState({ kind: 'ready', current: updated });
      setNewSourceTitle('');
      setNewSourceUrl('');
      setNotice('Đã lưu Google Place ID. Định danh CHƯA được xác nhận — trang công khai vẫn dùng link tìm kiếm cho tới khi người có quyền xác nhận.');
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : 'Lưu thất bại. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  // `expected_external_id` LUÔN lấy từ `current.external_id` ĐÃ TẢI trong state — KHÔNG phải một
  // giá trị tách rời có thể lệch khỏi màn hình người dùng đang nhìn (xem ghi chú đầy đủ ở
  // place-external-identifiers.api.ts). Nếu ai đó đổi ID giữa lúc tải và lúc bấm, server trả 409
  // (confirmErrorMessage xử lý) thay vì âm thầm xác nhận ID mới.
  async function onConfirm() {
    const session = readSession();
    if (!session) {
      setError(SESSION_EXPIRED_MESSAGE);
      return;
    }
    if (state.kind !== 'ready' || !state.current) return; // nút chỉ hiện khi có current — không thể xảy ra, không cần báo
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const updated = await confirmGooglePlaceId(placeId, { expected_external_id: state.current.external_id }, session.accessToken);
      setState({ kind: 'ready', current: updated });
      setNotice('Đã xác nhận: hồ sơ Google khớp địa điểm này. (Không xác minh quyền sở hữu, chất lượng cơ sở hay lối vào.)');
    } catch (err) {
      setError(confirmErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke() {
    const session = readSession();
    if (!session) {
      setError(SESSION_EXPIRED_MESSAGE);
      return;
    }
    if (state.kind !== 'ready' || !state.current) return; // nút chỉ hiện khi có current — không thể xảy ra, không cần báo
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const updated = await revokeGooglePlaceIdVerification(placeId, { expected_external_id: state.current.external_id }, session.accessToken);
      setState({ kind: 'ready', current: updated });
      setNotice('Đã thu hồi xác nhận. Định danh vẫn còn, trang công khai quay lại link tìm kiếm.');
    } catch (err) {
      setError(confirmErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const current = state.current;
  // Link mở ĐÚNG hồ sơ Google để đối chiếu trước khi xác nhận — cùng cơ chế URL đã dùng ở
  // mapLinks.ts (query_place_id), không gọi API trả phí nào, chỉ một liên kết điều hướng.
  const crossCheckUrl = current
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeName || current.external_id)}&query_place_id=${encodeURIComponent(current.external_id)}`
    : null;

  return (
    <section aria-label="Quản lý Google Place ID" className={styles.contentEditor}>
      <h2>Google Place ID</h2>
      <p className={styles.fieldHint}>
        Dùng để mở ĐÚNG hồ sơ địa điểm trên Google Maps thay vì chỉ tìm theo tên. Nhập ID lấy từ
        trang Google Maps của chính địa điểm này (không phải một cơ sở cùng tên khác).
      </p>
      <p className={styles.fieldHint}>
        Trạng thái hiện tại:{' '}
        {current ? (
          current.verified_at ? (
            <>đã xác nhận ({new Date(current.verified_at).toLocaleDateString('vi-VN')}) — hồ sơ Google khớp địa điểm này</>
          ) : (
            'đã nhập, CHƯA xác nhận — trang công khai chưa dùng ID này'
          )
        ) : (
          'chưa có'
        )}
      </p>
      <div className={styles.fieldGrid}>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Google Place ID</span>
          <input
            className={styles.input}
            type="text"
            value={externalId}
            onChange={(e) => setExternalId(e.target.value)}
            placeholder="Vd: ChIJN1t_tDeuEmsRUsoyG83frY4"
          />
        </label>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Nguồn/bằng chứng — tiêu đề (tuỳ chọn)</span>
          <input className={styles.input} type="text" value={newSourceTitle} onChange={(e) => setNewSourceTitle(e.target.value)} placeholder="Vd: Trang Google Maps của địa điểm" />
        </label>
        <label className={uiStyles.field}>
          <span className={uiStyles.fieldLabel}>Nguồn/bằng chứng — URL (tuỳ chọn)</span>
          <input className={styles.input} type="text" value={newSourceUrl} onChange={(e) => setNewSourceUrl(e.target.value)} placeholder="https://www.google.com/maps/place/…" />
        </label>
      </div>

      {error && <p className={styles.alert} role="alert">{error}</p>}
      {notice && <p className={styles.success} role="status">{notice}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.submitBtn} onClick={() => void onSave()} disabled={busy}>
          {busy ? 'Đang lưu…' : 'Lưu Google Place ID'}
        </button>
      </div>

      {current && (
        <div className={styles.contentEditor} style={{ marginTop: '1rem' }}>
          <h3>Xác nhận (vai trò quản trị/kiểm duyệt)</h3>
          <p className={styles.fieldHint}>
            Mở hồ sơ Google bên dưới, đối chiếu tên/địa chỉ/vị trí với địa điểm này, rồi mới xác
            nhận. &ldquo;Đã xác nhận&rdquo; chỉ nghĩa hồ sơ Google khớp địa điểm — không xác minh
            quyền sở hữu, chất lượng cơ sở hay lối vào.
          </p>
          {crossCheckUrl && (
            <p>
              <a href={crossCheckUrl} target="_blank" rel="noopener noreferrer">
                Mở hồ sơ Google để đối chiếu →
              </a>
            </p>
          )}
          <div className={styles.actions}>
            <button type="button" className={styles.submitBtn} onClick={() => void onConfirm()} disabled={busy}>
              {busy ? 'Đang xử lý…' : 'Xác nhận khớp địa điểm'}
            </button>
            {current.verified_at && (
              <button type="button" className={styles.archiveBtn} onClick={() => void onRevoke()} disabled={busy}>
                {busy ? 'Đang xử lý…' : 'Thu hồi xác nhận'}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
