// Helper gọi API backend. Base URL lấy từ env công khai (build-time hoặc runtime).

export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
}

/** Ghép base + path an toàn (chuẩn hóa dấu gạch chéo). */
export function buildApiUrl(path: string): string {
  const base = getApiBaseUrl().replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
