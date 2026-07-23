// Lớp API tập trung cho Auth (coding-standard §6: không gọi API rải rác trong component).
// Contract theo apps/api: envelope { success, data, meta } + AuthResult snake_case.

import { buildApiUrl } from '@/lib/api';
import type { AuthSession, AuthTokens, AuthUser } from '../types';

/** Lỗi API có mã ổn định (code) — component hiển thị message, log giữ code. */
export class AuthApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}

// ---- Wire types (snake_case, đúng như API trả) ----
interface WirePublicUser {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
}
interface WireAuthResult {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: WirePublicUser;
}
interface WireTokenResult {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

function mapUser(u: WirePublicUser): AuthUser {
  return { id: u.id, email: u.email, displayName: u.display_name, avatarUrl: u.avatar_url };
}

/** expires_in (giây) → mốc tuyệt đối expiresAt (epoch ms). */
function toTokens(t: WireTokenResult, now: number = Date.now()): AuthTokens {
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: now + t.expires_in * 1000,
  };
}

/** Gọi POST JSON + bóc envelope. Ném AuthApiError khi lỗi hoặc envelope không hợp lệ. */
async function postJson<T>(path: string, body: unknown, accessToken?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res: Response;
  try {
    res = await fetch(buildApiUrl(path), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new AuthApiError(`Không kết nối được máy chủ: ${(err as Error).message}`, 'NETWORK_ERROR', 0);
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // Response không phải JSON (vd 502 HTML) → coi như lỗi máy chủ.
  }

  const env = payload as
    | { success: true; data: T }
    | { success: false; error?: { code?: string; message?: string } }
    | null;

  if (res.ok && env && 'success' in env && env.success) {
    return env.data;
  }
  const code = (env && 'error' in env && env.error?.code) || 'UNKNOWN_ERROR';
  const message =
    (env && 'error' in env && env.error?.message) || `Yêu cầu thất bại (HTTP ${res.status})`;
  throw new AuthApiError(message, code, res.status);
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}
export interface LoginInput {
  email: string;
  password: string;
}

/** Đăng ký → trả phiên đầy đủ (WF-01). */
export async function register(input: RegisterInput): Promise<AuthSession> {
  const data = await postJson<WireAuthResult>('/auth/register', {
    email: input.email,
    password: input.password,
    display_name: input.displayName,
  });
  return { ...toTokens(data), user: mapUser(data.user) };
}

/** Đăng nhập → trả phiên đầy đủ (WF-02). */
export async function login(input: LoginInput): Promise<AuthSession> {
  const data = await postJson<WireAuthResult>('/auth/login', input);
  return { ...toTokens(data), user: mapUser(data.user) };
}

/** Xoay vòng token bằng refresh token (BE thu hồi token cũ). */
export async function refresh(refreshToken: string): Promise<AuthTokens> {
  const data = await postJson<WireTokenResult>('/auth/refresh', { refresh_token: refreshToken });
  return toTokens(data);
}

/** Đăng xuất: thu hồi refresh token (cần Bearer access token). Không ném khi BE lỗi nhẹ. */
export async function logout(refreshToken: string, accessToken: string): Promise<void> {
  await postJson<null>('/auth/logout', { refresh_token: refreshToken }, accessToken);
}
