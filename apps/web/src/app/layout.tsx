import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/modules/auth/AuthProvider';
import { getSiteUrl } from '@/lib/site';
import '../styles/globals.css';

export const metadata: Metadata = {
  // MVP SEO pass: without this, canonical URLs and OG images (already used by
  // places/[slug]/page.tsx) resolve against Next.js's own http://localhost:3000 fallback in
  // every environment, including production -- a real, previously-undiscovered gap.
  metadataBase: new URL(getSiteUrl()),
  title: 'PhuQuocHub',
  description: 'Wikipedia + Reddit + Google Maps cho Phú Quốc',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
