import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site';

// MVP SEO pass: no robots.txt existed anywhere before this (confirmed absent, PLACE-036/041).
// Next.js's native `app/robots.ts` convention -- served automatically at /robots.txt.
export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Auth-gated / non-content routes: no SEO value, and the dashboard requires a session
        // anyway -- disallowing it just saves crawl budget, it isn't a security boundary.
        disallow: ['/login', '/register', '/dashboard'],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
