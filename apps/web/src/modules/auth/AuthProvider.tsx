'use client';

// Client-state Auth qua React Context (giữ nhẹ, không thêm lib global-state cho MVP —
// tránh redesign kiến trúc Sprint 0). Hydrate phiên từ localStorage sau mount.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as authApi from './api/auth.api';
import { AuthApiError } from './api/auth.api';
import { EXPIRY_SKEW_MS, clearSession, isAccessTokenFresh, readSession, writeSession } from './session';
import type { AuthSession, AuthUser } from './types';

interface AuthContextValue {
  user: AuthUser | null;
  /** true trong lúc đọc phiên từ storage lần đầu (VÀ, nếu token đã hết hạn, trong lúc refresh
   *  chạy trước khi render nội dung bảo vệ) — route guard chờ mốc này. */
  initializing: boolean;
  isAuthenticated: boolean;
  /** true khi phiên vừa bị đóng do refresh token hỏng/hết hạn/bị thu hồi — KHÁC "chưa đăng nhập
   *  bao giờ". RouteGuard/trang login dùng cờ này để hiện đúng "Phiên đã hết hạn, đăng nhập lại"
   *  thay vì thông báo chung chung hoặc (tệ hơn) để mỗi request 401 hiển thị nhầm "không có quyền". */
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  // Tránh hai refresh chạy chồng (hydrate + timer bắn cùng lúc, hoặc StrictMode double-effect).
  const refreshInFlight = useRef<Promise<AuthSession | null> | null>(null);

  const persist = useCallback((next: AuthSession) => {
    writeSession(next);
    setSession(next);
    setSessionExpired(false);
  }, []);

  const closeExpiredSession = useCallback(() => {
    clearSession();
    setSession(null);
    setSessionExpired(true);
  }, []);

  // Xoay vòng access token bằng refresh token đang lưu. Trả về phiên mới (đã persist) hoặc null
  // nếu refresh thất bại (refresh token hỏng/hết hạn/bị thu hồi — auth-refresh-reuse-detection —
  // trong trường hợp đó phiên bị đóng LUÔN, không có gì để thử lại).
  const doRefresh = useCallback(
    async (current: AuthSession): Promise<AuthSession | null> => {
      if (refreshInFlight.current) return refreshInFlight.current;
      const task = (async () => {
        try {
          const tokens = await authApi.refresh(current.refreshToken);
          const next: AuthSession = { ...tokens, user: current.user };
          persist(next);
          return next;
        } catch (err) {
          // AuthApiError với NETWORK_ERROR nghĩa là mất kết nối, không phải refresh token hỏng —
          // KHÔNG đóng phiên vì lỗi mạng tạm thời (session vẫn còn trong localStorage, thử lại ở
          // lần refresh kế tiếp/khi request thật sự chạy). Mọi lỗi khác (401 invalid/revoked/reused)
          // nghĩa là phiên thật sự đã hết.
          if (err instanceof AuthApiError && err.code === 'NETWORK_ERROR') {
            return null;
          }
          closeExpiredSession();
          return null;
        } finally {
          refreshInFlight.current = null;
        }
      })();
      refreshInFlight.current = task;
      return task;
    },
    [persist, closeExpiredSession],
  );

  // Hydrate 1 lần sau mount (localStorage chỉ có ở client). Nếu token đã hết hạn ngay lúc hydrate
  // (tab bị bỏ không nhiều giờ rồi mở lại) → refresh TRƯỚC KHI hạ initializing, để RouteGuard
  // không render nội dung bảo vệ với token chết (tránh mọi view tự lãnh 401 rải rác).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = readSession();
      if (!stored) {
        if (!cancelled) setInitializing(false);
        return;
      }
      if (isAccessTokenFresh(stored)) {
        if (!cancelled) {
          setSession(stored);
          setInitializing(false);
        }
        return;
      }
      const refreshed = await doRefresh(stored);
      if (!cancelled) {
        if (!refreshed) setSession(null);
        setInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chạy đúng một lần sau mount; doRefresh ổn định qua useCallback.
  }, []);

  // Chủ động xoay vòng token TRƯỚC khi hết hạn trong lúc tab đang mở — đây là phần chính đóng gap
  // "token hết hạn giữa lúc đang soạn form": mọi dashboard view đọc token qua readSession() một
  // cách độc lập (không qua context), nên cách duy nhất giúp TẤT CẢ chúng luôn thấy token còn hạn
  // mà không phải sửa từng call site là giữ cho localStorage luôn chứa token mới trong nền.
  useEffect(() => {
    if (!session) return;
    const delay = Math.max(session.expiresAt - EXPIRY_SKEW_MS - Date.now(), 0);
    const timer = setTimeout(() => {
      void doRefresh(session);
    }, delay);
    return () => clearTimeout(timer);
  }, [session, doRefresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      persist(await authApi.login({ email, password }));
    },
    [persist],
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      persist(await authApi.register({ email, password, displayName }));
    },
    [persist],
  );

  const logout = useCallback(async () => {
    const current = session;
    // Xóa phiên client trước để UI phản hồi ngay (guest không thấy dữ liệu phiên trước ở lượt
    // render kế); thu hồi phía server best-effort.
    clearSession();
    setSession(null);
    setSessionExpired(false);
    if (current) {
      try {
        await authApi.logout(current.refreshToken, current.accessToken);
      } catch {
        // Token có thể đã hết hạn/thu hồi — không chặn luồng đăng xuất.
      }
    }
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      initializing,
      isAuthenticated: !!session,
      sessionExpired,
      login,
      register,
      logout,
    }),
    [session, initializing, sessionExpired, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook truy cập Auth; ném lỗi nếu dùng ngoài AuthProvider (lỗi lập trình). */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong <AuthProvider>');
  return ctx;
}
