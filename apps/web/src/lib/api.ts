// Helper gọi API backend.
//
// Server-side (SSR/RSC — chạy TRONG container web) PHẢI gọi qua địa chỉ nội bộ Docker network
// (`API_INTERNAL_URL`), KHÔNG BAO GIỜ qua `NEXT_PUBLIC_API_URL`: giá trị đó trỏ tới địa chỉ trình
// duyệt gọi được TỪ HOST (vd `127.0.0.1:14000`), không resolve được từ bên trong container — đây
// chính là nguyên nhân gốc khiến trang chi tiết Place báo "Không tải được dữ liệu địa điểm"
// (ECONNREFUSED 127.0.0.1:14000) khi SSR fetch dùng nhầm giá trị public. Browser-side fetch (client
// component) tiếp tục dùng `NEXT_PUBLIC_API_URL` như cũ. `API_INTERNAL_URL` không có tiền tố
// `NEXT_PUBLIC_` nên Next.js không bao giờ bake giá trị của nó vào client bundle — nhánh đọc nó
// dưới đây chỉ chạy khi `typeof window === 'undefined'`, tức là không bao giờ thực thi ở trình
// duyệt.
export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    const internal = process.env.API_INTERNAL_URL;
    if (internal) return internal;
    if (process.env.NODE_ENV === 'production') {
      // Fail-fast: KHÔNG được âm thầm rơi về localhost trong production — đó là chính xác lỗi vừa
      // sửa. Thiếu cấu hình phải báo lỗi rõ ràng ngay khi request đầu tiên chạy, không để trang cứ
      // âm thầm gọi nhầm địa chỉ rồi báo lỗi tải dữ liệu chung chung.
      throw new Error(
        'API_INTERNAL_URL chưa được cấu hình — server-side fetch không được âm thầm gọi localhost ở production.',
      );
    }
    return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
  }

  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
}

/** Ghép base + path an toàn (chuẩn hóa dấu gạch chéo). */
export function buildApiUrl(path: string): string {
  const base = getApiBaseUrl().replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
