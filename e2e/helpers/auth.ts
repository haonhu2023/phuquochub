import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { APIRequestContext, Page } from '@playwright/test';

// T1 (2026-09-22) — helpers dùng chung cho toàn bộ spec: tạo tài khoản thật qua API thật (không
// mock), cấp vai trò content_owner qua đúng script vận hành đã có (`operator:bootstrap` —
// KHÔNG viết cơ chế cấp quyền riêng cho test), và bơm phiên đăng nhập thẳng vào localStorage để
// các spec không phải lái form đăng nhập lại ở MỌI test (auth.spec.ts riêng lái form đăng nhập
// thật — xem file đó cho luồng UI đầy đủ).

export const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL ?? 'http://localhost:4000/api';
const API_DIR = path.resolve(__dirname, '../../apps/api');
const SESSION_STORAGE_KEY = 'pqh.auth.session.v1';

export interface WebAuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: { id: string; email: string; displayName: string; avatarUrl: string | null };
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@e2e.local`;
}

/** Đăng ký một tài khoản thật qua API thật, trả về phiên đầy đủ (chưa có vai trò đặc quyền nào). */
export async function registerAccount(
  request: APIRequestContext,
  prefix: string,
  password = 'E2ePass123!',
): Promise<WebAuthSession & { password: string }> {
  const email = uniqueEmail(prefix);
  const res = await request.post(`${API_BASE_URL}/auth/register`, {
    data: { email, password, display_name: `E2E ${prefix}` },
  });
  if (!res.ok()) {
    throw new Error(`[e2e] register thất bại (${res.status()}): ${await res.text()}`);
  }
  const body = await res.json();
  const data = body.data;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    user: {
      id: data.user.id,
      email: data.user.email,
      displayName: data.user.display_name,
      avatarUrl: data.user.avatar_url,
    },
    password,
  };
}

/**
 * Cấp vai trò `content_owner` cho một email — chạy đúng script vận hành thật
 * (`npm run operator:bootstrap`, `apps/api/src/scripts/bootstrap-operator.ts`), KHÔNG viết cơ chế
 * cấp quyền riêng cho test. Đồng bộ (script tự thoát sau khi ghi DB) — chạy trong `test.beforeAll`.
 */
export function bootstrapContentOwner(email: string): void {
  execFileSync('npm', ['run', 'operator:bootstrap'], {
    cwd: API_DIR,
    env: {
      ...process.env,
      BOOTSTRAP_OPERATOR_EMAIL: email,
      BOOTSTRAP_OPERATOR_ROLE: 'content_owner',
    },
    stdio: 'pipe',
    shell: true,
  });
}

/** Đăng ký + cấp content_owner trong một bước — dùng cho mọi spec cần một tài khoản đặc quyền. */
export async function createContentOwnerSession(
  request: APIRequestContext,
  prefix: string,
): Promise<WebAuthSession & { password: string }> {
  const session = await registerAccount(request, prefix);
  bootstrapContentOwner(session.user.email);
  return session;
}

/**
 * Bơm phiên đăng nhập thẳng vào localStorage của `page` (thay vì lái lại form đăng nhập ở mọi
 * spec — auth.spec.ts đã kiểm form đăng nhập thật riêng). Vai trò/quyền vừa cấp bằng
 * `bootstrapContentOwner` chỉ phản ánh vào phiên MỚI (JWT cũ không tự cập nhật claims) — session
 * bơm ở đây LUÔN là phiên vừa đăng ký/bootstrap xong, không phải một session cache cũ.
 */
export async function seedSession(page: Page, session: WebAuthSession): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: SESSION_STORAGE_KEY, value: session },
  );
  await page.reload();
}
