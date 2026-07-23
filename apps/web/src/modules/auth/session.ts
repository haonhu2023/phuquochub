// Lưu/đọc phiên đăng nhập ở client. Tách khỏi React để test thuần (jest env=node).
//
// LƯU Ý bảo mật: MVP lưu token trong localStorage (auth.md §1.2 chưa chốt cookie
// httpOnly). Access token ngắn hạn + refresh xoay vòng/thu hồi được ở Redis (BE)
// là lớp phòng vệ chính. Khi auth.md bổ sung chính sách cookie → thay lớp này,
// không đụng phần còn lại của module.

import type { AuthSession } from './types';

/** Khóa namespace + version để dễ migrate khi đổi cấu trúc phiên. */
export const SESSION_STORAGE_KEY = 'pqh.auth.session.v1';

/** Cửa sổ an toàn (ms): coi token là "sắp hết hạn" trước mốc thật để refresh sớm. */
export const EXPIRY_SKEW_MS = 30_000;

/** Giao diện Storage tối giản — cho phép inject fake khi test / no-op ở server. */
export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Lấy localStorage nếu ở trình duyệt; server-side render → null (no-op). */
export function getDefaultStorage(): SessionStorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // Một số môi trường chặn localStorage (private mode) → coi như không có.
    return null;
  }
}

/** Đọc phiên đã lưu; trả null nếu trống hoặc dữ liệu hỏng. */
export function readSession(storage: SessionStorageLike | null = getDefaultStorage()): AuthSession | null {
  if (!storage) return null;
  const raw = storage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isValidSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Ghi phiên. */
export function writeSession(
  session: AuthSession,
  storage: SessionStorageLike | null = getDefaultStorage(),
): void {
  if (!storage) return;
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

/** Xóa phiên (đăng xuất / token hỏng). */
export function clearSession(storage: SessionStorageLike | null = getDefaultStorage()): void {
  if (!storage) return;
  storage.removeItem(SESSION_STORAGE_KEY);
}

/** Access token còn hạn (có trừ skew) không? */
export function isAccessTokenFresh(session: AuthSession, now: number = Date.now()): boolean {
  return session.expiresAt - EXPIRY_SKEW_MS > now;
}

/** Kiểm tra hình dạng phiên để không nạp dữ liệu rác vào state. */
export function isValidSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  const u = s.user as Record<string, unknown> | undefined;
  return (
    typeof s.accessToken === 'string' &&
    typeof s.refreshToken === 'string' &&
    typeof s.expiresAt === 'number' &&
    !!u &&
    typeof u.id === 'string' &&
    typeof u.email === 'string' &&
    typeof u.displayName === 'string'
  );
}
