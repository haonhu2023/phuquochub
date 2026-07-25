'use client';

// Client-state Auth qua React Context (giữ nhẹ, không thêm lib global-state cho MVP —
// tránh redesign kiến trúc Sprint 0). Hydrate phiên từ localStorage sau mount.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as authApi from './api/auth.api';
import { clearSession, readSession, writeSession } from './session';
import type { AuthSession, AuthUser } from './types';

interface AuthContextValue {
  user: AuthUser | null;
  /** true trong lúc đọc phiên từ storage lần đầu — route guard chờ mốc này. */
  initializing: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Hydrate 1 lần sau mount (localStorage chỉ có ở client).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate-once-on-mount từ localStorage, không có external-store subscription để thay thế.
    setSession(readSession());
    setInitializing(false);
  }, []);

  const persist = useCallback((next: AuthSession) => {
    writeSession(next);
    setSession(next);
  }, []);

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
    // Xóa phiên client trước để UI phản hồi ngay; thu hồi phía server best-effort.
    clearSession();
    setSession(null);
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
      login,
      register,
      logout,
    }),
    [session, initializing, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook truy cập Auth; ném lỗi nếu dùng ngoài AuthProvider (lỗi lập trình). */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong <AuthProvider>');
  return ctx;
}
