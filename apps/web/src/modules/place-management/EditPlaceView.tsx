'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import placeStyles from '@/modules/places/places.module.css';
import { PlaceForm } from './PlaceForm';
import { previewPlace, publishPlace, publishPlaceDraft, saveDraftPlace, unpublishPlace } from './api/place-management.api';
import { triggerRevalidate } from '@/lib/revalidate';
import { placeStatusClassKey, placeStatusLabel } from './statusLabels';
import type { ManagedPlace, PlaceFormInput } from './types';
import styles from './place-management.module.css';

type State =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; place: ManagedPlace };

interface Props {
  placeId: string;
}

function publishActionErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Bạn không có quyền xuất bản/gỡ công khai địa điểm này.';
    if (err.status === 404) return 'Địa điểm không còn tồn tại.';
    if (err.status < 500) return err.message;
  }
  return 'Thao tác thất bại. Vui lòng thử lại.';
}

// Sửa địa điểm (PATCH /places/:id, Place.Edit.Managed — hoặc Place.Edit.Any cho biên tập viên
// toàn cục/content_owner). Dữ liệu điền sẵn form tải qua GET /places/:id/preview (P3, 2026-09-22)
// — KHÔNG còn qua listMyPlaces().find(): listMine() chỉ liệt kê grant scope='managed' có
// business_id cụ thể, nên content_owner (Place.Edit.Any, business_id=null) không bao giờ xuất
// hiện ở đó dù họ sửa được MỌI place qua đúng route PATCH này. `/preview` dùng ĐÚNG permission
// check mà PATCH đã dùng, nên "tải được để sửa" luôn khớp "sửa được" — không có khoảng lệch quyền
// giữa đọc và ghi. 404/403 từ preview vẫn hiển thị thành "không tìm thấy" như trước (không phân
// biệt "không tồn tại" với "không phải của bạn").
export function EditPlaceView({ placeId }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  // Bug thật tìm thấy bằng Playwright T1 (2026-09-22): `<PlaceForm key={content_version} .../>`
  // dưới đây CỐ Ý remount PlaceForm sau mỗi lần lưu thành công (để nó nhận `initial` mới nhất mà
  // không cần người dùng tải lại trang — xem comment ở handleSubmit). Nhưng remount đó xảy ra
  // NGAY TRONG cùng lượt xử lý PlaceForm's handleSubmit tự đặt `success=true` SAU khi `onSubmit`
  // (chính là hàm này) resolve — nên thông điệp "Đã lưu thành công." của PlaceForm không bao giờ
  // kịp hiển thị cho người dùng thật (xác nhận bằng tay qua trình duyệt: lưu thành công thật,
  // content_version tăng đúng, nhưng KHÔNG có thông báo nào hiện ra). PlaceForm.spec.tsx không bắt
  // được vì nó test PlaceForm ĐỘC LẬP, không mô phỏng đúng hành vi remount-qua-key của cha thật.
  // Sửa bằng cách đặt thông báo "đã lưu" Ở CHA (component này KHÔNG bị remount) thay vì tin vào
  // state nội bộ của con sắp bị thay thế.
  const [saveNotice, setSaveNotice] = useState(false);

  const load = useCallback(() => {
    const session = readSession();
    if (!session) {
      setState({ kind: 'signed-out' });
      return;
    }
    setState({ kind: 'loading' });
    previewPlace(placeId, session.accessToken)
      .then((place) => setState({ kind: 'ready', place }))
      .catch((err: unknown) => {
        if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
          setState({ kind: 'not-found' });
          return;
        }
        const message = err instanceof ApiError && err.status < 500 ? err.message : 'Đã xảy ra lỗi khi tải địa điểm. Vui lòng thử lại.';
        setState({ kind: 'error', message });
      });
  }, [placeId]);

  /**
   * BẢNG CHỨC NĂNG — chống ghi đè theo TỪNG trường của PlaceForm (2026-09-16, hoàn tất 2026-09-17,
   * gộp nhánh production 2026-09-23). Không phải toàn bộ form đi qua CÙNG một cơ chế; đây là danh
   * sách đầy đủ, không giấu trường nào:
   *
   * | Trường                                          | Bảo vệ ghi đè (CAS) | Cơ chế                                  |
   * |--------------------------------------------------|----------------------|-------------------------------------------|
   * | category_id/ward/address/price_range/            | CÓ — 409 nếu bị trôi | saveDraftPlace() -> publishPlaceDraft()    |
   * | opening_hours/location                            | (xmin, không phải    | (PlacesService.saveDraft/publishDraft —    |
   * |                                                    | timestamp)           | location tham gia từ 2026-09-17)           |
   * | name / short_description / description            | KHÔNG qua form này   | CHẶN nếu đổi ở đây — dùng nút ✏️ trên trang |
   * |                                                    | (route riêng có CAS  | (PlaceDescriptionEditor, mở rộng cả ba     |
   * |                                                    | thật ở tầng dịch)    | trường, place_translations thật, có xem    |
   * |                                                    |                      | trước + nháp + công khai)                  |
   * | status (draft/published)                          | Không phải CAS —    | handlePublish()/handleUnpublish() bên dưới |
   * |                                                    | một trạng thái, mọi  | (Place.Approve) — trục ĐỘC LẬP với nội     |
   * |                                                    | actor có quyền đều   | dung: xuất bản chỉ đổi khả năng hiển thị   |
   * |                                                    | đổi được ngay        | công khai, không đụng nội dung scalar      |
   *
   * KHÔNG còn trường nào ghi qua PATCH không-CAS nữa — `updatePlaceLegacyFields()` (tồn tại tới
   * 2026-09-17) đã bị GỠ vì không còn caller nào cần đường ghi không bảo vệ đó.
   */
  useEffect(() => {
    // Trì hoãn qua microtask — `load()` gọi setState ngay ở nhánh đồng bộ (chuyển sang
    // 'loading'/'signed-out'), và gọi trực tiếp trong thân effect bị flag bởi
    // react-hooks/set-state-in-effect. Cùng khuôn AuthProvider.tsx (hydrate-once-on-mount).
    void Promise.resolve().then(load);
  }, [load]);

  async function handleSubmit(input: PlaceFormInput): Promise<void> {
    const session = readSession();
    if (!session) {
      throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    }
    if (state.kind !== 'ready') {
      throw new Error('Không tải được địa điểm hiện tại — tải lại trang và thử lại.');
    }
    if (input.name !== state.place.name || input.short_description !== state.place.short_description || input.description !== state.place.description) {
      throw new Error(
        'Sửa tên/mô tả ngắn/mô tả chi tiết ở đây chưa được bảo vệ khỏi ghi đè — dùng nút ✏️ trên trang địa điểm (có xem trước, lưu nháp, không bị mất khi người khác sửa cùng lúc).',
      );
    }
    setSaveNotice(false);
    const wasPublished = state.place.status === 'published';
    try {
      const draft = await saveDraftPlace(
        placeId,
        {
          category_id: input.category_id,
          address: input.address,
          ward: input.ward,
          price_range: input.price_range,
          opening_hours: input.opening_hours,
          location: input.location,
        },
        session.accessToken,
      );
      await publishPlaceDraft(placeId, draft.id, session.accessToken);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        throw new Error('Địa điểm đã được người khác cập nhật — tải lại trang và thử lại.');
      }
      throw err;
    }
    // Cùng khuôn bug-fix T1 (2026-09-22, xem ghi chú saveNotice ở đầu component): `load()` tải lại
    // dữ liệu mới nhất (bao gồm content_version mới sau publishPlaceDraft) rồi mới báo "đã lưu" Ở
    // CHA — không tin state nội bộ sắp mất của PlaceForm sắp bị remount qua key.
    load();
    setSaveNotice(true);
    // C1 — chỉ đáng invalidate cache công khai khi place ĐÃ published TRƯỚC lần sửa này (một place
    // còn draft chưa từng có trong cache công khai để mà lệch; đọc từ state TRƯỚC saveDraftPlace vì
    // saveDraftPlace/publishPlaceDraft không tự đổi status).
    if (wasPublished) {
      void triggerRevalidate({ entityType: 'place', slug: state.place.slug }, session.accessToken);
    }
  }

  async function handlePublish() {
    const session = readSession();
    if (!session || publishBusy) return;
    setPublishBusy(true);
    setPublishError(null);
    try {
      await publishPlace(placeId, session.accessToken);
      load();
      if (state.kind === 'ready') {
        void triggerRevalidate({ entityType: 'place', slug: state.place.slug }, session.accessToken);
      }
    } catch (err) {
      setPublishError(publishActionErrorMessage(err));
    } finally {
      setPublishBusy(false);
    }
  }

  async function handleUnpublish() {
    const session = readSession();
    if (!session || publishBusy) return;
    const confirmed = window.confirm(
      'Gỡ công khai địa điểm này? Địa điểm sẽ không còn hiển thị trên trang công khai cho tới khi bạn xuất bản lại. Có thể hồi phục bất cứ lúc nào bằng nút "Xuất bản".',
    );
    if (!confirmed) return;
    setPublishBusy(true);
    setPublishError(null);
    try {
      await unpublishPlace(placeId, session.accessToken);
      load();
      if (state.kind === 'ready') {
        void triggerRevalidate({ entityType: 'place', slug: state.place.slug }, session.accessToken);
      }
    } catch (err) {
      setPublishError(publishActionErrorMessage(err));
    } finally {
      setPublishBusy(false);
    }
  }

  if (state.kind === 'signed-out') {
    return (
      <main>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Cần đăng nhập</p>
          <p>Đăng nhập để sửa địa điểm.</p>
          <Link href={`/login?next=/dashboard/places/${placeId}/edit`} className={placeStyles.btn}>
            Đăng nhập
          </Link>
        </div>
      </main>
    );
  }

  if (state.kind === 'loading') {
    return (
      <main aria-busy="true">
        <p style={{ color: 'var(--muted)' }}>Đang tải địa điểm…</p>
      </main>
    );
  }

  if (state.kind === 'not-found') {
    return (
      <main>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không tìm thấy địa điểm</p>
          <p>Địa điểm này không tồn tại, hoặc bạn không có quyền quản lý nó.</p>
          <Link href="/dashboard/places" className={placeStyles.btn}>
            ← Về Địa điểm của tôi
          </Link>
        </div>
      </main>
    );
  }

  if (state.kind === 'error') {
    return (
      <main>
        <div className={placeStyles.state} role="alert">
          <p className={placeStyles.stateTitle}>Không tải được địa điểm</p>
          <p>{state.message}</p>
          <Link href="/dashboard/places" className={placeStyles.btn}>
            ← Về Địa điểm của tôi
          </Link>
        </div>
      </main>
    );
  }

  const isPublished = state.place.status === 'published';

  return (
    <main>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Sửa: {state.place.name}</h1>
        <p style={{ marginTop: '0.5rem' }}>
          Trạng thái:{' '}
          <span className={`${styles.statusBadge} ${styles[placeStatusClassKey(state.place.status)]}`}>
            {placeStatusLabel(state.place.status)}
          </span>
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          <Link href={`/dashboard/places/${placeId}/managers`} style={{ color: 'var(--accent)' }}>
            Quản lý người quản lý →
          </Link>
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          <Link href={`/dashboard/places/${placeId}/contacts`} style={{ color: 'var(--accent)' }}>
            Quản lý liên hệ →
          </Link>
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          <Link href={`/dashboard/places/${placeId}/photos`} style={{ color: 'var(--accent)' }}>
            Quản lý ảnh →
          </Link>
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          <Link href={`/dashboard/places/${placeId}/preview`} style={{ color: 'var(--accent)' }}>
            Xem trước →
          </Link>
          {isPublished && (
            <>
              {' · '}
              <Link href={`/places/${state.place.slug}`} target="_blank" style={{ color: 'var(--accent)' }}>
                Xem trang công khai →
              </Link>
            </>
          )}
        </p>

        {publishError && (
          <p className={styles.alert} role="alert" style={{ marginTop: '0.75rem' }}>
            {publishError}
          </p>
        )}

        <div className={styles.actions} style={{ marginTop: '0.75rem' }}>
          {isPublished ? (
            <button type="button" className={styles.archiveBtn} onClick={handleUnpublish} disabled={publishBusy}>
              {publishBusy ? 'Đang gỡ…' : 'Gỡ công khai'}
            </button>
          ) : (
            <button type="button" className={styles.submitBtn} onClick={handlePublish} disabled={publishBusy}>
              {publishBusy ? 'Đang xuất bản…' : 'Xuất bản'}
            </button>
          )}
        </div>
      </header>
      {saveNotice && (
        <p className={styles.success} role="status">
          Đã lưu thành công.
        </p>
      )}
      <PlaceForm
        key={state.place.content_version}
        initial={state.place}
        submitLabel="Lưu thay đổi"
        submittingLabel="Đang lưu…"
        onSubmit={handleSubmit}
        cancelHref="/dashboard/places"
      />
    </main>
  );
}
