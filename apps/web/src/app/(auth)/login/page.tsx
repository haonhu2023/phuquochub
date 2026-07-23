'use client';

// Trang đăng nhập (Sprint 1 · WF-02). Sau khi đăng nhập → về `next` (nếu có) hoặc /dashboard.

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { AuthApiError } from '@/modules/auth/api/auth.api';
import { useAuth } from '@/modules/auth/AuthProvider';
import { AuthError, AuthField, authStyles } from '@/modules/auth/AuthForm';

function safeNext(raw: string | null): string {
  // Chỉ chấp nhận đường dẫn nội bộ để tránh open-redirect.
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/dashboard';
}

function LoginForm() {
  const { login, isAuthenticated, initializing } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Đã đăng nhập thì không ở lại trang login.
  useEffect(() => {
    if (!initializing && isAuthenticated) router.replace(next);
  }, [initializing, isAuthenticated, next, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace(next);
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Đăng nhập thất bại, thử lại sau.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={authStyles.card}>
      <h1 style={{ marginTop: 0 }}>Đăng nhập</h1>
      <form onSubmit={onSubmit} noValidate>
        <AuthError>{error}</AuthError>
        <AuthField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          disabled={submitting}
          onChange={setEmail}
        />
        <AuthField
          id="password"
          label="Mật khẩu"
          type="password"
          autoComplete="current-password"
          value={password}
          disabled={submitting}
          onChange={setPassword}
        />
        <button type="submit" style={authStyles.button} disabled={submitting}>
          {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
      <p style={{ color: 'var(--muted)', marginTop: '1.25rem', marginBottom: 0 }}>
        Chưa có tài khoản?{' '}
        <Link href="/register" style={{ color: 'var(--accent)' }}>
          Đăng ký
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams cần Suspense boundary trong App Router.
  return (
    <Suspense fallback={<div style={authStyles.card}>Đang tải…</div>}>
      <LoginForm />
    </Suspense>
  );
}
