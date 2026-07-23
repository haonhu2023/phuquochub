'use client';

// Khối UI dùng chung cho trang đăng nhập/đăng ký. Dùng inline-style + CSS vars
// đồng bộ với apps/web hiện tại (Sprint 0 chưa dùng Tailwind — không thêm ở đây).

import type { CSSProperties, ReactNode } from 'react';

const card: CSSProperties = {
  maxWidth: 400,
  margin: '0 auto',
  padding: '2rem',
  border: '1px solid #1e293b',
  borderRadius: 12,
  background: '#0f172a',
};

const label: CSSProperties = {
  display: 'block',
  marginBottom: '0.35rem',
  fontSize: '0.9rem',
  color: 'var(--muted)',
};

const input: CSSProperties = {
  width: '100%',
  padding: '0.6rem 0.75rem',
  marginBottom: '1rem',
  borderRadius: 8,
  border: '1px solid #1e293b',
  background: 'var(--bg)',
  color: 'var(--fg)',
  fontSize: '1rem',
};

const button: CSSProperties = {
  width: '100%',
  padding: '0.7rem 1rem',
  borderRadius: 8,
  border: 'none',
  background: 'var(--accent)',
  color: '#04263a',
  fontSize: '1rem',
  fontWeight: 600,
  cursor: 'pointer',
};

export const authStyles = { card, label, input, button };

export function AuthField(props: {
  id: string;
  label: string;
  type: string;
  value: string;
  autoComplete?: string;
  minLength?: number;
  maxLength?: number;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const { id, label: text, onChange, ...rest } = props;
  return (
    <div>
      <label htmlFor={id} style={authStyles.label}>
        {text}
      </label>
      <input
        id={id}
        name={id}
        required
        style={authStyles.input}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
    </div>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" style={{ color: 'var(--err)', marginTop: 0, marginBottom: '1rem' }}>
      {children}
    </p>
  );
}
