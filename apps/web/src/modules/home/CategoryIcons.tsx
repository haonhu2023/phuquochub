// Icon SVG inline nhỏ, rights-safe (tự vẽ, không phải icon font/thư viện ngoài) cho từng danh mục
// trang chủ (Phase 7 — category discovery V2). Không kéo theo phụ thuộc mới; mỗi icon là JSX thuần.
// Ánh xạ theo `href` của mục danh mục (`home.copy.ts`), không theo tên hiển thị (tên đổi theo
// locale, href thì không).
import type { JSX } from 'react';

const ICONS: Record<string, (props: { className?: string }) => JSX.Element> = {
  '/hotels': ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 20V6a1 1 0 0 1 1-1h5v15" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path
        d="M9 20V11a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M3 20h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="6.5" cy="9.5" r="0.9" fill="currentColor" />
      <path d="M13 14h3M13 17h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  '/restaurants': ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 3v7a2 2 0 0 0 4 0V3M8 10v11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M17 3c-1.7 0-3 2-3 5s1.3 5 3 5v8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  '/tours': ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="m14.5 9.5-2 5-5 2 2-5z" fill="currentColor" />
    </svg>
  ),
  '/attractions': ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2 9.5 8.5 3 11l6.5 2.5L12 20l2.5-6.5L21 11l-6.5-2.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  ),
  '/beaches': ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 18c1.6 0 1.6 1.5 3.2 1.5S6.8 18 8.4 18s1.6 1.5 3.2 1.5S13.2 18 14.8 18s1.6 1.5 3.2 1.5S19.6 18 21.2 18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M12 3v9M8 8l4-5 4 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  '/events': ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8.5" cy="14" r="1" fill="currentColor" />
      <circle cx="12" cy="14" r="1" fill="currentColor" />
    </svg>
  ),
};

export function CategoryIcon({ href, className }: { href: string; className?: string }) {
  const Icon = ICONS[href];
  if (!Icon) return null;
  return <Icon className={className} />;
}
