'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_LOCALE, type Locale } from './locale';

// Seam server→client cho locale (PR A). Server Component (`[locale]/(public)/layout.tsx`) đọc
// `params.locale` rồi bọc `{children}` bằng Provider này — Client Component con dùng `useLocale()`
// thay vì tự `usePathname()` rồi tự parse segment đầu, tránh mỗi component tự viết lại logic đó
// (và tự lệch nhau nếu route tree đổi sau này).
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}
