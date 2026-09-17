'use client';

import { useEffect, useState } from 'react';

export interface AuthenticatedImageState {
  src: string | null;
  loading: boolean;
  error: boolean;
}

/**
 * Tải MỘT ảnh qua kênh cần xác thực (Bearer header) rồi trả về Object URL dùng cho `<img src>`.
 *
 * TẠI SAO cần hook này (Owner Photos Manager Drawer, 2026-09-17): các kênh ảnh nội bộ
 * (`/places/{id}/media/{id}/file`, `/media/{id}/moderation-file`) đứng sau `JwtAuthGuard` TOÀN CỤC
 * — guard đó CHỈ đọc header `Authorization` (`jwt-auth.guard.ts`), không có phương án cookie dự
 * phòng nào. Gắn thẳng các URL đó vào `<img src>` KHÔNG hoạt động trong trình duyệt thật: request
 * ảnh trình duyệt tự phát không bao giờ mang theo header tuỳ chỉnh, nên luôn nhận 401 trước khi kịp
 * theo dõi 302 sang URL đã ký — lỗi này TRƯỚC ĐÂY không bài test nào bắt được vì jsdom không thực sự
 * gửi request ảnh. Phải tự `fetch()` (có header) — `fetch` tự theo dõi redirect sang URL đã ký
 * (bước đó không cần header, URL đã ký tự mang xác thực dạng chữ ký) — rồi biến response thành
 * Object URL cho thẻ `<img>`.
 *
 * `url`/`accessToken` là `null`/`undefined` → không tải gì, trả về trạng thái rỗng (không lỗi).
 */
export function useAuthenticatedImage(
  url: string | null | undefined,
  accessToken: string | null | undefined,
): AuthenticatedImageState {
  const [state, setState] = useState<AuthenticatedImageState>({ src: null, loading: true, error: false });

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    if (!url || !accessToken) {
      // Đẩy setState ra khỏi thân effect (qua microtask) — cùng quy ước với PlacePhotosManager/
      // PhotosView: gọi setState ĐỒNG BỘ ngay trong effect gây cascading render không cần thiết.
      void Promise.resolve().then(() => {
        if (!cancelled) setState({ src: null, loading: false, error: false });
      });
      return () => {
        cancelled = true;
      };
    }

    void Promise.resolve()
      .then(() => {
        if (!cancelled) setState({ src: null, loading: true, error: false });
        return fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ src: objectUrl, loading: false, error: false });
      })
      .catch(() => {
        if (!cancelled) setState({ src: null, loading: false, error: true });
      });

    return () => {
      cancelled = true;
      // Thu hồi NGAY khi effect dọn dẹp (đổi url/token, hoặc unmount) — Object URL giữ tham chiếu
      // blob trong bộ nhớ tới khi bị thu hồi tường minh, không tự động theo garbage collector.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, accessToken]);

  return state;
}
