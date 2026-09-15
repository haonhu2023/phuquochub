'use client';

import { useEffect, useState } from 'react';
import modStyles from './moderation.module.css';

type State =
  | { kind: 'loading' }
  | { kind: 'forbidden' } // 401/403 — token thiếu/hết hạn hoặc thiếu quyền Media.Moderate
  | { kind: 'error' } // mọi lỗi khác (mạng, 404, 5xx) — không phân biệt chi tiết, tránh rò rỉ nội bộ
  | { kind: 'ready'; objectUrl: string };

/**
 * Ảnh xem trước cho kiểm duyệt viên — `/media/{id}/moderation-file` (gác `Media.Moderate`) đòi
 * header `Authorization: Bearer <token>`, mà một thẻ `<img src>` thường KHÔNG BAO GIỜ gửi được
 * header tuỳ ý — trình duyệt chỉ đính header đó vào request do JS tự thực hiện (`fetch`). Trước
 * đây `<img src={preview.preview_url}>` gọi thẳng URL đó không kèm header nào, nên request luôn
 * 401 và ảnh vỡ, bất kể kiểm duyệt viên có đúng quyền hay không — đây là NGUYÊN NHÂN xác nhận qua
 * trace code, không phải phỏng đoán.
 *
 * Khắc phục: tự `fetch()` kèm `Authorization`, đọc response thành `Blob`, dựng `Object URL` tạm
 * (`URL.createObjectURL`) rồi mới gán vào `<img src>`. Object URL bị thu hồi (`revokeObjectURL`)
 * khi unmount HOẶC khi `src` đổi (case khác) — không để rò rỉ bộ nhớ qua nhiều lượt xem.
 *
 * KHÔNG BAO GIỜ đặt token vào URL/query string/log — chỉ ở header `Authorization` của chính
 * request này, không đi qua console.error hay bất kỳ log nào.
 */
export function AuthenticatedMediaPreview({
  src,
  alt,
  accessToken,
}: {
  src: string;
  alt: string;
  accessToken: string;
}) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    // setState phải nằm trong callback bất đồng bộ (microtask), không gọi đồng bộ ngay trong thân
    // effect — cùng khuôn PhotosView.tsx/ModerationCaseView.tsx đã áp dụng trong codebase này
    // (react-hooks/set-state-in-effect).
    void Promise.resolve().then(() => {
      if (!cancelled) setState({ kind: 'loading' });
    });

    fetch(src, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' })
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          throw new Error('forbidden');
        }
        if (!res.ok) {
          throw new Error('error');
        }
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ kind: 'ready', objectUrl });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState(err instanceof Error && err.message === 'forbidden' ? { kind: 'forbidden' } : { kind: 'error' });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, accessToken]);

  if (state.kind === 'loading') {
    return <div className={modStyles.previewBox} aria-busy="true" aria-label="Đang tải ảnh xem trước" />;
  }
  if (state.kind === 'forbidden') {
    return <p className={modStyles.previewEmpty}>Không có quyền xem ảnh này (phiên đăng nhập hết hạn hoặc thiếu quyền).</p>;
  }
  if (state.kind === 'error') {
    return <p className={modStyles.previewEmpty}>Không tải được ảnh xem trước. Vui lòng thử lại.</p>;
  }

  // eslint-disable-next-line @next/next/no-img-element -- Object URL cục bộ (blob:), không phải ảnh host ngoài; next/image không áp dụng.
  return <img className={modStyles.previewImage} src={state.objectUrl} alt={alt} />;
}
