'use client';

// Trang đăng ký (Sprint 1 · WF-01). Ràng buộc khớp RegisterDto: email, password 8–128, displayName 1–120.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { AuthApiError } from '@/modules/auth/api/auth.api';
import { useAuth } from '@/modules/auth/AuthProvider';
import { AuthError, AuthField, authStyles } from '@/modules/auth/AuthForm';

export default function RegisterPage() {
  const { register, isAuthenticated, initializing } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!initializing && isAuthenticated) router.replace('/dashboard');
  }, [initializing, isAuthenticated, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Mật khẩu tối thiểu 8 ký tự.');
      return;
    }
    setSubmitting(true);
    try {
      await register(email, password, displayName);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'Đăng ký thất bại, thử lại sau.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={authStyles.card}>
      <h1 style={{ marginTop: 0 }}>Đăng ký</h1>
      <form onSubmit={onSubmit} noValidate>
        <AuthError>{error}</AuthError>
        <AuthField
          id="displayName"
          label="Tên hiển thị"
          type="text"
          autoComplete="name"
          maxLength={120}
          value={displayName}
          disabled={submitting}
          onChange={setDisplayName}
        />
        <AuthField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          maxLength={255}
          value={email}
          disabled={submitting}
          onChange={setEmail}
        />
        <AuthField
          id="password"
          label="Mật khẩu (tối thiểu 8 ký tự)"
          type="password"
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          value={password}
          disabled={submitting}
          onChange={setPassword}
        />
        <button type="submit" style={authStyles.button} disabled={submitting}>
          {submitting ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}
        </button>
      </form>
      <p style={{ color: 'var(--muted)', marginTop: '1.25rem', marginBottom: 0 }}>
        Đã có tài khoản?{' '}
        <Link href="/login" style={{ color: 'var(--accent)' }}>
          Đăng nhập
        </Link>
      </p>
    </div>
  );
}
