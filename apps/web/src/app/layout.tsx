import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/modules/auth/AuthProvider';
import '../styles/globals.css';

export const metadata: Metadata = {
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
