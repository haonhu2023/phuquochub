import type { Metadata } from 'next';
import { getSiteUrl } from './site';

// Metadata mặc định dùng CHUNG cho mọi root layout (PR A tách `app/layout.tsx` thành 3 root độc
// lập — `[locale]/layout.tsx`, `(auth)/layout.tsx`, `(dashboard)/layout.tsx` — vì Next.js App
// Router không cho một root layout duy nhất nhận `params.locale` khi route hiện tại không có
// segment đó (`/dashboard`, `/login`...). Hằng số này giữ đúng giá trị `app/layout.tsx` cũ, chỉ
// đổi CHỖ khai báo để dùng lại được ở cả 3 nơi thay vì lặp lại y hệt 3 lần.
export const DEFAULT_METADATA: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: 'PhuQuocHub',
  description: 'Wikipedia + Reddit + Google Maps cho Phú Quốc',
};
